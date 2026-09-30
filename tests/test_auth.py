# tests/test_auth.py
from conftest import login, save_evidence, ADMIN_USER, VENDEDOR_USER, BASE_URL

def test_admin_login_success(page):
    username, password = ADMIN_USER
    login(page, username, password)
    save_evidence(page, "test_admin_login_success", "01_dashboard")
    assert page.url != f"{BASE_URL}/login"

def test_vendedor_login_success(page):
    username, password = VENDEDOR_USER
    login(page, username, password)
    save_evidence(page, "test_vendedor_login_success", "01_dashboard")
    assert page.url != f"{BASE_URL}/login"

def test_invalid_credentials_rejected(page):
    page.goto(f"{BASE_URL}/login")
    page.get_by_label("Usuario").fill("admin")
    page.get_by_label("Contraseña").fill("wrong-password")
    page.get_by_role("button", name="Ingresar").click()
    # Login is async (awaits the API call); wait for the error alert to
    # actually render before screenshotting/asserting, otherwise this races
    # the in-flight request and catches the loading spinner instead.
    page.wait_for_selector("[role='alert']")
    save_evidence(page, "test_invalid_credentials_rejected", "01_error")
    assert page.url == f"{BASE_URL}/login"
    assert page.get_by_text("incorrect", exact=False).is_visible() or page.get_by_text("incorrecta", exact=False).is_visible()
