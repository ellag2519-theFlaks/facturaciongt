# tests/test_invoices.py
"""E2E tests for invoice creation, IVA/total math, stock deduction, and the
role-scoped invoice history (vendedor sees only their own; admin sees all).

Each test creates its own product via the admin UI (unique SKU/name,
uuid4-based) with a known price and stock, so the IVA/total math and the
stock-delta assertion never depend on a pre-existing product with a
convenient price.
"""
import re
import uuid

from conftest import ADMIN_USER, BASE_URL, VENDEDOR_USER, login, save_evidence


def _unique_sku():
    return f"SKU-{uuid.uuid4().hex[:8]}"


def _create_product_via_ui(page, name, sku, price, stock, category=""):
    """Create a product as whoever is currently logged in (must be admin).
    Assumes the "Nuevo producto" button is currently visible."""
    page.get_by_role("button", name="Nuevo producto").click()
    page.get_by_label("Nombre").fill(name)
    page.get_by_label("SKU").fill(sku)
    page.get_by_label("Precio").fill(str(price))
    page.get_by_label("Stock").fill(str(stock))
    if category:
        page.get_by_label("Categoría").fill(category)
    page.get_by_role("button", name="Crear").click()
    row = page.locator("tr", has_text=sku)
    row.wait_for()
    return row


def _parse_currency(text):
    """Extracts the amount following the 'Q ' currency marker, e.g.
    'IVA (12%): Q 13.50' -> 13.50. Anchored on 'Q' specifically (rather than
    the first digit run) because labels like 'IVA (12%)' contain digits of
    their own before the actual amount."""
    match = re.search(r"Q\s*([\d.]+)", text)
    return float(match.group(1))


def _select_product_by_name(page, product_name):
    """The <select> option label is '{name} — {price} (stock: N)', which
    changes as other tests/invoices mutate stock -- so match the option by
    substring on its visible text rather than an exact label string, and
    select by its value attribute."""
    select = page.locator("#product_id")
    option = select.locator("option", has_text=product_name)
    value = option.get_attribute("value")
    select.select_option(value)


def _create_invoice_via_ui(page, customer_name, product_name, quantity):
    """Fill and submit the new-invoice form. Assumes /invoices/new is
    already loaded. Returns nothing; caller reads totals before submit."""
    page.get_by_label("Cliente").fill(customer_name)
    _select_product_by_name(page, product_name)
    quantity_input = page.get_by_label("Cantidad")
    quantity_input.fill(str(quantity))
    page.get_by_role("button", name="Agregar").click()


def test_vendedor_creates_invoice_totals_and_stock_deduct(page):
    # Admin creates a fresh product with a known price/stock first --
    # products are admin-only (see test_products.py), so a vendedor can't
    # create their own fixture data.
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    product_name = f"Producto Factura {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    price = 37.50
    initial_stock = 20
    quantity = 3
    _create_product_via_ui(page, product_name, sku, price, initial_stock)

    # Log back out/in as vendedor to create the invoice.
    login(page, *VENDEDOR_USER)
    page.goto(f"{BASE_URL}/invoices/new")

    customer_name = f"Cliente Test {uuid.uuid4().hex[:6]}"
    _create_invoice_via_ui(page, customer_name, product_name, quantity)

    # Read the displayed subtotal/IVA/total BEFORE submitting. Anchored
    # regexes (^...) are needed here, not plain substrings: Playwright's
    # get_by_text substring match is case-insensitive, and "Subtotal:"
    # itself contains "total:" as a substring, so an unanchored search for
    # "Total:" would ambiguously match both the Subtotal and Total lines.
    expected_subtotal = round(price * quantity, 2)
    subtotal_text = page.get_by_text(re.compile(r"^Subtotal:")).inner_text()
    tax_text = page.get_by_text(re.compile(r"^IVA \(12%\):")).inner_text()
    total_text = page.get_by_text(re.compile(r"^Total:")).inner_text()

    displayed_subtotal = _parse_currency(subtotal_text)
    displayed_tax = _parse_currency(tax_text)
    displayed_total = _parse_currency(total_text)

    assert displayed_subtotal == expected_subtotal
    assert displayed_total == round(displayed_subtotal * 1.12, 2)
    assert displayed_tax == round(displayed_subtotal * 0.12, 2)

    save_evidence(page, "test_vendedor_creates_invoice_totals_and_stock_deduct", "01_totals_before_submit")

    page.get_by_role("button", name="Crear factura").click()
    status = page.get_by_role("status")
    status.wait_for()
    save_evidence(page, "test_vendedor_creates_invoice_totals_and_stock_deduct", "02_invoice_created")
    assert status.is_visible()

    # Admin checks the product's stock decreased by exactly the invoiced quantity.
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")
    row = page.locator("tr", has_text=sku)
    row.wait_for()
    expected_stock = initial_stock - quantity
    row.get_by_text(str(expected_stock), exact=True).wait_for()
    save_evidence(page, "test_vendedor_creates_invoice_totals_and_stock_deduct", "03_stock_decreased")
    assert row.get_by_text(str(expected_stock), exact=True).is_visible()

    # Vendedor's own invoice appears in their history.
    login(page, *VENDEDOR_USER)
    page.goto(f"{BASE_URL}/invoices")
    history_row = page.locator("tr", has_text=customer_name)
    history_row.wait_for()
    save_evidence(page, "test_vendedor_creates_invoice_totals_and_stock_deduct", "04_vendedor_history")
    assert history_row.is_visible()


def test_invoice_history_scoped_by_role(page):
    # Admin creates a product to invoice against.
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")
    product_name = f"Producto Historial {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    _create_product_via_ui(page, product_name, sku, 10, 50)

    # Admin creates their own invoice (any authenticated user can create
    # invoices -- /invoices/new isn't admin-gated).
    admin_customer = f"Cliente Admin {uuid.uuid4().hex[:6]}"
    page.goto(f"{BASE_URL}/invoices/new")
    _create_invoice_via_ui(page, admin_customer, product_name, 1)
    page.get_by_role("button", name="Crear factura").click()
    page.get_by_role("status").wait_for()

    # Vendedor creates their own, distinct invoice.
    login(page, *VENDEDOR_USER)
    vendedor_customer = f"Cliente Vendedor {uuid.uuid4().hex[:6]}"
    page.goto(f"{BASE_URL}/invoices/new")
    _create_invoice_via_ui(page, vendedor_customer, product_name, 1)
    page.get_by_role("button", name="Crear factura").click()
    page.get_by_role("status").wait_for()

    # Vendedor's history shows their own invoice but NOT the admin's.
    page.goto(f"{BASE_URL}/invoices")
    page.locator("tr", has_text=vendedor_customer).wait_for()
    save_evidence(page, "test_invoice_history_scoped_by_role", "01_vendedor_history")
    assert page.locator("tr", has_text=vendedor_customer).is_visible()
    assert page.locator("tr", has_text=admin_customer).count() == 0

    # Admin's history shows invoices from both.
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/invoices")
    page.locator("tr", has_text=admin_customer).wait_for()
    save_evidence(page, "test_invoice_history_scoped_by_role", "02_admin_history")
    assert page.locator("tr", has_text=admin_customer).is_visible()
    assert page.locator("tr", has_text=vendedor_customer).is_visible()


def test_new_invoice_submit_disabled_until_item_added(page):
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")
    product_name = f"Producto Vacio {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    _create_product_via_ui(page, product_name, sku, 5, 10)

    login(page, *VENDEDOR_USER)
    page.goto(f"{BASE_URL}/invoices/new")

    submit_button = page.get_by_role("button", name="Crear factura")
    submit_button.wait_for()
    save_evidence(page, "test_new_invoice_submit_disabled_until_item_added", "01_empty_cart_disabled")
    assert submit_button.is_disabled()

    # Customer name alone (still no items) must keep it disabled.
    page.get_by_label("Cliente").fill(f"Cliente Vacio {uuid.uuid4().hex[:6]}")
    assert submit_button.is_disabled()

    # Adding one item (with customer name already filled) enables it.
    _select_product_by_name(page, product_name)
    page.get_by_role("button", name="Agregar").click()
    save_evidence(page, "test_new_invoice_submit_disabled_until_item_added", "02_item_added_enabled")
    assert submit_button.is_enabled()
