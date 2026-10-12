# tests/test_volume_pruebas_no_funcionales.py
"""NF-VOL-01 (plan de pruebas, Fase 2): prueba de volumen sobre el
historial de facturas.

Siembra 110 facturas sintéticas directamente vía la API REST de
facturacion-service (NO por la UI -- clicar 110 veces sería
impracticablemente lento), marcadas con un identificador único de esta
corrida, y luego usa la UI real para verificar que el historial sigue
respondiendo correctamente con ese volumen: búsqueda, paginación completa
y conteo exacto en la última página.

100% offline/local -- no depende de la base de datos de desarrollo ya
tener datos acumulados, ni de ninguna red externa.
"""
import math
import uuid

from conftest import ADMIN_USER, API_BASE_URL, BASE_URL, VENDEDOR_USER, login, save_evidence

INVOICE_COUNT = 110
PAGE_SIZE = 10  # InvoiceHistoryPage/usePaginatedSearch's fixed page size


def _get_token(request_context, username, password):
    res = request_context.post(f"{API_BASE_URL}/auth/login", data={"username": username, "password": password})
    assert res.ok, f"login failed: {res.status} {res.text()}"
    return res.json()["token"]


def test_invoice_history_handles_110_synthetic_invoices(page):
    run_marker = f"VolTest{uuid.uuid4().hex[:8]}"

    admin_token = _get_token(page.request, *ADMIN_USER)
    product_res = page.request.post(
        f"{API_BASE_URL}/products",
        headers={"Authorization": f"Bearer {admin_token}"},
        data={"name": f"Producto {run_marker}", "sku": f"SKU-{run_marker}", "price": 10, "stock": 100000},
    )
    assert product_res.ok, f"product creation failed: {product_res.status} {product_res.text()}"
    product_id = product_res.json()["id"]

    vendedor_token = _get_token(page.request, *VENDEDOR_USER)
    for i in range(INVOICE_COUNT):
        invoice_res = page.request.post(
            f"{API_BASE_URL}/invoices",
            headers={"Authorization": f"Bearer {vendedor_token}"},
            data={
                "customer_name": f"Cliente {run_marker} {i:03d}",
                "items": [{"product_id": product_id, "quantity": 1}],
            },
        )
        assert invoice_res.ok, f"invoice #{i} failed: {invoice_res.status} {invoice_res.text()}"

    # Now verify through the real UI, under this volume.
    login(page, *ADMIN_USER)
    page.goto(f"{BASE_URL}/invoices")
    search_box = page.get_by_placeholder("Buscar por factura, cliente, NIT, vendedor...")
    search_box.fill(run_marker)

    # Page 1 must show exactly PAGE_SIZE rows filtered to this run's invoices.
    page.locator("tbody tr").first.wait_for()
    save_evidence(page, "test_invoice_history_handles_110_synthetic_invoices", "01_page_1_filtered")
    assert page.locator("tbody tr").count() == PAGE_SIZE

    # Pagination.jsx only has "Anterior"/"Siguiente" (no numbered buttons),
    # so reaching the last page means clicking "Siguiente" repeatedly.
    expected_pages = math.ceil(INVOICE_COUNT / PAGE_SIZE)
    page_indicator = page.get_by_text(f"Página 1 de {expected_pages}")
    page_indicator.wait_for()

    next_button = page.get_by_role("button", name="Siguiente")
    for _ in range(expected_pages - 1):
        next_button.click()
    page.get_by_text(f"Página {expected_pages} de {expected_pages}").wait_for()
    assert next_button.is_disabled()

    expected_last_page_rows = INVOICE_COUNT - PAGE_SIZE * (expected_pages - 1)
    save_evidence(page, "test_invoice_history_handles_110_synthetic_invoices", "02_last_page")
    assert page.locator("tbody tr").count() == expected_last_page_rows
