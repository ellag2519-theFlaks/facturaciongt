# tests/test_usd_payment.py
"""E2E test for creating an invoice with USD ('Dólares') as the payment
currency.

*** REAL NETWORK DEPENDENCY ***
This is the ONLY test in the whole project that depends on real internet
connectivity. Creating a USD invoice makes facturacion-service call the real
exchange-service (port 3002), which itself calls the REAL Banco de Guatemala
SOAP web service (banguat.gob.gt) to fetch today's exchange rate -- nothing
here is stubbed. If this machine has no internet access, or banguat.gob.gt is
unreachable/down, this test will fail for an environmental reason unrelated
to any code defect in this project. Every other E2E test file is fully
offline/self-contained.

Because the real rate changes daily and isn't knowable ahead of time, this
test never asserts an exact rate or exact USD total. It reads whatever dollar
amount and rate the real page actually shows and cross-checks them against
each other (total_gtq / rate_shown ~= total_usd) and against the known GTQ
math (which the real rate cannot affect).
"""
import re
import uuid

from conftest import ADMIN_USER, BASE_URL, VENDEDOR_USER, login, save_evidence

TEST_NAME = "test_create_usd_invoice_shows_dollar_equivalent"


def _unique_sku():
    return f"SKU-{uuid.uuid4().hex[:8]}"


def _create_product_via_ui(page, name, sku, price, stock):
    page.get_by_role("button", name="Nuevo producto").click()
    page.get_by_label("Nombre").fill(name)
    page.get_by_label("SKU").fill(sku)
    page.get_by_label("Precio").fill(str(price))
    page.get_by_label("Stock").fill(str(stock))
    page.get_by_role("button", name="Crear").click()
    # The products table is client-side paginated (ProductsPage/Pagination),
    # and after months of accumulated test runs the catalog now spans many
    # pages -- a freshly created row (sorted last, by id) is very likely NOT
    # on the default first page. Filter down via the page's own search box
    # (matches name/sku/etc, see ProductsPage.jsx's getSearchableText) so the
    # new row is guaranteed to render on page 1, instead of assuming it's
    # visible without filtering like the older per-file helpers do.
    page.get_by_placeholder("Buscar por nombre, SKU, categoría...").fill(sku)
    row = page.locator("tr", has_text=sku)
    row.wait_for()
    return row


def _select_product_by_name(page, product_name):
    # Same pattern as test_invoices.py: the <select> option label is
    # "{name} — {price} (stock: N)", which can shift as other tests mutate
    # stock, so match by substring on the visible text and select by value.
    select = page.locator("#product_id")
    option = select.locator("option", has_text=product_name)
    value = option.get_attribute("value")
    select.select_option(value)


def _parse_gtq(text):
    """Extract the amount following the 'Q ' currency marker (formatCurrency's
    output), e.g. 'Total Q 123.45' -> 123.45. Anchored on 'Q' rather than the
    first digit run because labels can contain digits of their own."""
    match = re.search(r"Q\s*([\d.]+)", text)
    assert match, f"no 'Q <amount>' found in {text!r}"
    return float(match.group(1))


def _parse_equivalente(text):
    """Extract (total_usd, exchange_rate) from InvoiceDetailPage's
    Equivalente value span, e.g. '$123.45 USD (tasa: 7.64254)' ->
    (123.45, 7.64254). This is the real, live Banguat-derived rate -- never
    asserted against a hardcoded expectation since it changes daily."""
    match = re.search(r"\$\s*([\d.]+)\s*USD\s*\(tasa:\s*([\d.]+)\)", text)
    assert match, f"no '$<amount> USD (tasa: <rate>)' found in {text!r}"
    return float(match.group(1)), float(match.group(2))


def test_create_usd_invoice_shows_dollar_equivalent(page):
    # Admin creates a fresh product with a known GTQ price first (products
    # are admin-only; a vendedor can't create their own fixture data).
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    product_name = f"Producto USD {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    price = 50.00
    initial_stock = 10
    quantity = 2
    _create_product_via_ui(page, product_name, sku, price, initial_stock)

    expected_subtotal = round(price * quantity, 2)
    expected_tax = round(expected_subtotal * 0.12, 2)
    expected_total_gtq = round(expected_subtotal + expected_tax, 2)

    # Vendedor creates the invoice, selecting "Dólares" as the payment
    # currency before submitting.
    login(page, *VENDEDOR_USER)
    page.goto(f"{BASE_URL}/invoices/new")

    customer_name = f"Cliente USD {uuid.uuid4().hex[:6]}"
    page.get_by_label("Cliente").fill(customer_name)
    _select_product_by_name(page, product_name)
    page.get_by_label("Cantidad").fill(str(quantity))
    page.get_by_role("button", name="Agregar").click()

    page.get_by_label("Moneda de pago").select_option(label="Dólares")

    save_evidence(page, TEST_NAME, "01_usd_currency_selected")

    page.get_by_role("button", name="Crear factura").click()

    # InvoiceForm's success banner (role="status") only ever renders the GTQ
    # total via formatCurrency() -- it does not show a dollar amount itself
    # (confirmed by reading the current InvoiceForm.jsx before writing this
    # test). The dollar equivalent is surfaced on the history list and the
    # invoice detail page instead, both checked below. Here we just confirm
    # the banner (i.e. the submission actually succeeded, including the real
    # Banguat round-trip) appeared.
    status = page.get_by_role("status")
    status.wait_for()
    save_evidence(page, TEST_NAME, "02_invoice_created")
    assert status.is_visible()
    assert "creada" in status.inner_text()

    # History list: the Total cell for a USD invoice appends
    # " (≈ $X.XX USD, tasa: Y)" (InvoiceList.jsx) -- this is where the
    # dollar amount is actually first surfaced to the user.
    page.goto(f"{BASE_URL}/invoices")
    # Like the products table, invoice history is client-side paginated
    # (InvoiceHistoryPage/Pagination) and has accumulated many pages across
    # prior test runs -- filter via the page's own search box (matches
    # customer_name, see InvoiceHistoryPage.jsx's getSearchableText) so this
    # invoice is guaranteed to land on page 1 instead of assuming it already
    # is.
    page.get_by_placeholder("Buscar por factura, cliente, NIT, vendedor...").fill(customer_name)
    history_row = page.locator("tr", has_text=customer_name)
    history_row.wait_for()
    history_row_text = history_row.inner_text()
    save_evidence(page, TEST_NAME, "03_history_shows_usd")
    assert re.search(r"\$\s*[\d.]+", history_row_text), (
        f"expected a '$<digits>' dollar amount in the history row, got {history_row_text!r}"
    )

    # Open the invoice's detail page via the history list link (same
    # navigation pattern as the existing invoice E2E tests).
    history_row.get_by_role("link", name="Ver detalle").click()
    page.wait_for_url(re.compile(r"/invoices/\d+$"))

    total_row_text = page.get_by_text(re.compile(r"^Total$"), exact=True).locator("xpath=..").inner_text()
    equivalente_row_text = (
        page.get_by_text(re.compile(r"^Equivalente$"), exact=True).locator("xpath=..").inner_text()
    )
    save_evidence(page, TEST_NAME, "04_detail_page_equivalente")

    total_gtq_shown = _parse_gtq(total_row_text)
    total_usd_shown, rate_shown = _parse_equivalente(equivalente_row_text)

    # GTQ math is independent of the real (unknowable-ahead-of-time) Banguat
    # rate, so it can still be asserted exactly.
    assert total_gtq_shown == expected_total_gtq

    # Cross-check the displayed USD total against the displayed rate and GTQ
    # total -- both read live off the real page, never assumed -- instead of
    # asserting any specific rate value.
    implied_usd = total_gtq_shown / rate_shown
    assert abs(implied_usd - total_usd_shown) < 0.01, (
        f"total_gtq ({total_gtq_shown}) / rate ({rate_shown}) = {implied_usd:.4f}, "
        f"expected within 0.01 of displayed total_usd ({total_usd_shown})"
    )

    # Sanity bound: a real USD/GTQ rate is a small positive number (currently
    # ~7-8); this guards against a parsing mistake (e.g. picking up the wrong
    # number) rather than pinning an exact value.
    assert 1 < rate_shown < 50
