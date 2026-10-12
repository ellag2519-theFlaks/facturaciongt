# tests/test_products_pruebas_funcionales.py
"""E2E tests for the admin Products page: create, edit, delete, the
DUPLICATE_SKU (409) inline error, and the admin-only route guard.

Each test generates its own unique SKU/name (uuid4-based) so runs never
collide with data left behind by earlier runs against the same database.
"""
import uuid

from conftest import ADMIN_USER, API_BASE_URL, BASE_URL, VENDEDOR_USER, login, save_evidence


def _get_token(request_context, username, password):
    res = request_context.post(f"{API_BASE_URL}/auth/login", data={"username": username, "password": password})
    assert res.ok, f"login failed: {res.status} {res.text()}"
    return res.json()["token"]


def _unique_sku():
    return f"SKU-{uuid.uuid4().hex[:8]}"


def _create_product_via_ui(page, name, sku, price, stock, category=""):
    """Open the create form, fill it, and submit. Assumes the "Nuevo
    producto" button is currently visible (no form already open)."""
    page.get_by_role("button", name="Nuevo producto").click()
    page.get_by_label("Nombre").fill(name)
    page.get_by_label("SKU").fill(sku)
    page.get_by_label("Precio").fill(str(price))
    page.get_by_label("Stock").fill(str(stock))
    if category:
        page.get_by_label("Categoría").fill(category)
    page.get_by_role("button", name="Crear").click()


def _find_product_row(page, sku):
    """Returns the product's row locator, after filtering the products
    table via the search box so a freshly created row is visible even if
    the dev DB has enough rows to push it past page 1 of the default
    pagination."""
    page.get_by_placeholder("Buscar por nombre, SKU, categoría...").fill(sku)
    return page.locator("tr", has_text=sku)


def test_admin_create_product(page):
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    name = f"Producto Test {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    _create_product_via_ui(page, name, sku, 99.99, 10, "General")

    row = _find_product_row(page, sku)
    row.wait_for()
    save_evidence(page, "test_admin_create_product", "01_product_created")

    assert row.is_visible()
    assert row.get_by_text(name).is_visible()


def test_admin_edit_product_price(page):
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    name = f"Producto Editar {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    _create_product_via_ui(page, name, sku, 50, 5)

    row = _find_product_row(page, sku)
    row.wait_for()

    row.get_by_role("button", name="Editar").click()
    page.get_by_label("Precio").fill("123.45")
    page.get_by_role("button", name="Guardar cambios").click()

    row = _find_product_row(page, sku)
    row.get_by_text("Q 123.45").wait_for()
    save_evidence(page, "test_admin_edit_product_price", "01_price_updated")

    assert row.get_by_text("Q 123.45").is_visible()


def test_admin_delete_product(page):
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    name = f"Producto Eliminar {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    _create_product_via_ui(page, name, sku, 20, 3)

    row = _find_product_row(page, sku)
    row.wait_for()

    # The delete handler uses window.confirm(); accept it so the delete
    # proceeds instead of being dismissed by Playwright's default behavior.
    page.once("dialog", lambda dialog: dialog.accept())
    row.get_by_role("button", name="Eliminar").click()

    page.wait_for_selector(f"tr:has-text('{sku}')", state="detached")
    save_evidence(page, "test_admin_delete_product", "01_product_deleted")

    assert page.locator("tr", has_text=sku).count() == 0


def test_admin_duplicate_sku_shows_inline_error(page):
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    sku = _unique_sku()
    name_original = f"Producto Original {uuid.uuid4().hex[:6]}"
    _create_product_via_ui(page, name_original, sku, 15, 2)

    row = _find_product_row(page, sku)
    row.wait_for()

    # Re-use the same SKU for a second product: the backend rejects this
    # with a 409 DUPLICATE_SKU, which ProductForm renders as a <p role="alert">
    # next to the SKU field specifically -- not the generic error banner
    # (a <div role="alert">) used for other errors.
    name_duplicate = f"Producto Duplicado {uuid.uuid4().hex[:6]}"
    _create_product_via_ui(page, name_duplicate, sku, 30, 4)

    sku_error = page.locator("p[role='alert']", has_text="El SKU ya existe")
    sku_error.wait_for()
    save_evidence(page, "test_admin_duplicate_sku_shows_inline_error", "01_duplicate_sku_error")

    assert sku_error.is_visible()
    # The rejected submission must not have created a second product.
    assert page.locator("tr", has_text=name_duplicate).count() == 0


def test_admin_delete_invoiced_product_shows_inline_error(page):
    """Backend rejects this with 409 PRODUCT_IN_USE (see
    facturacion-service/test/products.routes.pruebas_integracion.test.js,
    "deleting a product that has been invoiced"); this is the matching E2E
    check that the UI surfaces that rejection instead of silently failing
    or removing the row. First observed manually in the "Pruebas
    responsive" recording (2026-10-12) -- this automates it.
    """
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/products")

    name = f"Producto Facturado {uuid.uuid4().hex[:6]}"
    sku = _unique_sku()
    _create_product_via_ui(page, name, sku, 25, 5)

    row = _find_product_row(page, sku)
    row.wait_for()

    # The table itself has no data-id attribute, so look the product back
    # up by its (unique) sku via the API this page already reads from.
    admin_token = _get_token(page.request, *ADMIN_USER)
    products_res = page.request.get(
        f"{API_BASE_URL}/products", headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert products_res.ok, f"product lookup failed: {products_res.status} {products_res.text()}"
    product_id = next(p["id"] for p in products_res.json() if p["sku"] == sku)

    # Invoice the product via the API (a vendedor action) so the delete
    # attempt below has a real invoice_items reference to collide with --
    # driving a full UI checkout flow here would only be re-testing
    # test_invoices_pruebas_funcionales.py, not this page's behavior.
    vendedor_token = _get_token(page.request, *VENDEDOR_USER)
    invoice_res = page.request.post(
        f"{API_BASE_URL}/invoices",
        headers={"Authorization": f"Bearer {vendedor_token}"},
        data={
            "customer_name": f"Cliente {uuid.uuid4().hex[:6]}",
            "items": [{"product_id": product_id, "quantity": 1}],
        },
    )
    assert invoice_res.ok, f"invoice creation failed: {invoice_res.status} {invoice_res.text()}"

    page.reload()
    row = _find_product_row(page, sku)
    row.wait_for()

    page.once("dialog", lambda dialog: dialog.accept())
    row.get_by_role("button", name="Eliminar").click()

    error_banner = page.locator("div[role='alert']", has_text="No se puede eliminar un producto que ya ha sido facturado")
    error_banner.wait_for()
    save_evidence(page, "test_admin_delete_invoiced_product_shows_inline_error", "01_delete_blocked_error")

    assert error_banner.is_visible()
    # The rejected delete must not have removed the row.
    assert _find_product_row(page, sku).count() == 1


def test_vendedor_redirected_from_products(page):
    login(page, *VENDEDOR_USER)
    page.goto(f"{BASE_URL}/products")

    # ProtectedRoute redirects any non-admin role away to "/" client-side
    # (no 403 page) -- wait for that navigation rather than asserting
    # immediately, since it happens after the auth check renders.
    page.wait_for_url(f"{BASE_URL}/")
    save_evidence(page, "test_vendedor_redirected_from_products", "01_redirected_home")

    assert page.url == f"{BASE_URL}/"
    # Navbar (added in Task 18) also renders the brand text "Sistema de
    # Facturación", so a plain get_by_text match is ambiguous (Playwright
    # strict-mode violation). Scope to the HomePage's <h1> specifically.
    assert page.get_by_role("heading", name="Sistema de Facturación").is_visible()
    assert page.get_by_text("Productos", exact=True).count() == 0
