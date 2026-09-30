# tests/test_stock_limits.py
"""E2E tests for the stock-limit guard on invoice creation: the client-side
disabled-submit guard (Task 13), and a server-side INSUFFICIENT_STOCK check
that survives an attempt to bypass that guard.
"""
import uuid

from conftest import ADMIN_USER, BASE_URL, VENDEDOR_USER, login, save_evidence


def _unique_sku():
    return f"SKU-{uuid.uuid4().hex[:8]}"


def _create_product_via_ui(page, name, sku, price, stock, category=""):
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


def _select_product_by_name(page, product_name):
    select = page.locator("#product_id")
    option = select.locator("option", has_text=product_name)
    value = option.get_attribute("value")
    select.select_option(value)


def _get_stock_from_products_page(page, sku):
    row = page.locator("tr", has_text=sku)
    row.wait_for()
    # ProductList renders stock inside a <span> (StockBadge); it's the only
    # numeric-looking badge cell in the row, positioned right before the
    # Editar/Eliminar actions cell.
    return row.locator("td").nth(4).inner_text().strip()


def test_adding_quantity_over_stock_disables_submit(page):
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    product_name = f"Producto Limite {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    stock = 5
    _create_product_via_ui(page, product_name, sku, 15, stock)

    login(page, *VENDEDOR_USER)
    page.goto(f"{BASE_URL}/invoices/new")

    page.get_by_label("Cliente").fill(f"Cliente Limite {uuid.uuid4().hex[:6]}")
    _select_product_by_name(page, product_name)
    # Ask for more than the available stock up front.
    page.get_by_label("Cantidad").fill(str(stock + 3))
    page.get_by_role("button", name="Agregar").click()

    # InvoiceItemRow flags the line (aria-invalid + role=alert "Stock
    # disponible: N") and InvoiceForm's canSubmit guard (hasStockIssue)
    # disables the submit button -- it's a real disabled attribute, not
    # just a CSS style, per the Task 13 fix round.
    stock_alert = page.get_by_role("alert").filter(has_text="Stock disponible")
    stock_alert.wait_for()
    submit_button = page.get_by_role("button", name="Crear factura")

    save_evidence(page, "test_adding_quantity_over_stock_disables_submit", "01_over_stock_disabled")

    assert stock_alert.is_visible()
    assert f"Stock disponible: {stock}" in stock_alert.inner_text()
    assert submit_button.is_disabled()

    # Reducing the quantity back to exactly the available stock clears the
    # issue and re-enables submit, confirming the guard tracks live state
    # rather than latching permanently.
    quantity_input = page.locator("table tr", has_text=product_name).locator("input[type='number']")
    quantity_input.fill(str(stock))
    save_evidence(page, "test_adding_quantity_over_stock_disables_submit", "02_at_stock_enabled")
    assert page.get_by_role("alert").filter(has_text="Stock disponible").count() == 0
    assert submit_button.is_enabled()


def test_backend_rejects_insufficient_stock_and_leaves_stock_unchanged(page, browser):
    """Constructs a race that bypasses the client-side guard: a vendedor tab
    loads the invoice form while stock is still high enough, then an admin
    tab (a SEPARATE browser context -- localStorage is shared per-origin
    within a context, so reusing context.new_page() for the second user
    would silently overwrite the first user's session token) edits the
    product's stock down below what the vendedor tab already queued. The
    vendedor tab's client-side snapshot of stock is now stale when it
    submits. The backend's INSUFFICIENT_STOCK check (validated against live
    DB stock at transaction time, not the client's stale copy) must still
    reject the over-quantity submission and leave stock unchanged.
    """
    admin_page = page
    login(admin_page, *ADMIN_USER)
    admin_page.goto(f"{BASE_URL}/products")

    product_name = f"Producto Carrera {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    initial_stock = 4
    _create_product_via_ui(admin_page, product_name, sku, 8, initial_stock)

    # Vendedor tab: a fresh, isolated browser context so its login doesn't
    # clobber the admin tab's session in shared localStorage. Loads the
    # invoice form while stock is still 4 and queues a line for all 4 units
    # (valid against the stock it fetched).
    vendedor_context = browser.new_context()
    tab1 = vendedor_context.new_page()
    login(tab1, *VENDEDOR_USER)
    tab1.goto(f"{BASE_URL}/invoices/new")
    tab1.get_by_label("Cliente").fill(f"Cliente Carrera {uuid.uuid4().hex[:6]}")
    _select_product_by_name(tab1, product_name)
    tab1.get_by_label("Cantidad").fill(str(initial_stock))
    tab1.get_by_role("button", name="Agregar").click()
    # Submit button is enabled here: tab1's in-memory product list still
    # shows the original stock, and quantity == that stock.
    submit_button = tab1.get_by_role("button", name="Crear factura")
    assert submit_button.is_enabled()

    # Admin (main tab) drops stock to below what tab1 queued, simulating
    # another sale that already consumed some of it.
    admin_page.goto(f"{BASE_URL}/products")
    row = admin_page.locator("tr", has_text=sku)
    row.wait_for()
    row.get_by_role("button", name="Editar").click()
    admin_page.get_by_label("Stock").fill("1")
    admin_page.get_by_role("button", name="Guardar cambios").click()
    admin_page.locator("tr", has_text=sku).get_by_text("1", exact=True).wait_for()

    # Tab1 submits its now-stale request (still asking for `initial_stock`
    # units against a product that now only has 1 in stock).
    submit_button.click()
    error_banner = tab1.locator("div[role='alert']")
    error_banner.wait_for()
    save_evidence(tab1, "test_backend_rejects_insufficient_stock_and_leaves_stock_unchanged", "01_backend_rejection")

    assert error_banner.is_visible()
    assert "Stock insuficiente" in error_banner.inner_text()

    # Cross-check via the products page: stock must be unchanged (still 1,
    # not decremented and not the pre-edit value either).
    admin_page.goto(f"{BASE_URL}/products")
    stock_value = _get_stock_from_products_page(admin_page, sku)
    save_evidence(admin_page, "test_backend_rejects_insufficient_stock_and_leaves_stock_unchanged", "02_stock_unchanged")
    assert stock_value == "1"

    vendedor_context.close()
