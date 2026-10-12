# tests/test_compatibility_pruebas_no_funcionales.py
"""NF-COMP-01 (plan de pruebas, Fase 2): compatibilidad responsive en un
viewport móvil emulado (375x812, equivalente a un iPhone SE/8).

*** HALLAZGO, NO CORRECCIÓN ***
Al verificar manualmente (navegador real, 2026-10-11) se confirmó un
desbordamiento horizontal real: el Navbar (frontend/src/components/Navbar.jsx)
no tiene ningún tratamiento responsive -- en 375px de ancho, el link
"Productos" queda cortado y el bloque de usuario/rol + "Cerrar sesión" caen
completamente fuera del viewport (scrollWidth 555 vs clientWidth 375,
confirmado en /  y en /invoices).

Por instrucción explícita del proyecto, este archivo NO corrige el Navbar --
documenta el comportamiento real tal cual es, igual que
test/security-findings.test.js (NF-SEG-01) del backend. Las aserciones
confirman que el desbordamiento EXISTE hoy, para que el hallazgo quede
registrado y de evidencia; el día que alguien lo corrija, estas pruebas
fallarán y señalarán exactamente que hay que actualizarlas.

Compatibilidad EMULADA (viewport de Playwright), no probada en un
dispositivo real -- se deja explícito porque el plan de pruebas distingue
ambos casos.
"""
from conftest import ADMIN_USER, BASE_URL, login, save_evidence

MOBILE_VIEWPORT = {"width": 375, "height": 812}  # iPhone SE/8, emulado


def _get_overflow(page):
    return page.evaluate(
        "() => ({ scrollWidth: document.documentElement.scrollWidth, "
        "clientWidth: document.documentElement.clientWidth })"
    )


def test_navbar_overflows_horizontally_on_mobile_viewport(page):
    login(page, *ADMIN_USER)
    page.set_viewport_size(MOBILE_VIEWPORT)
    page.goto(f"{BASE_URL}/")

    overflow = _get_overflow(page)
    save_evidence(page, "test_navbar_overflows_horizontally_on_mobile_viewport", "01_home_overflow")

    # HALLAZGO: hoy el Navbar SÍ desborda. Esta aserción documenta el
    # comportamiento real -- no es el resultado deseado.
    assert overflow["scrollWidth"] > overflow["clientWidth"], (
        f"expected today's known overflow (scrollWidth > clientWidth), got "
        f"scrollWidth={overflow['scrollWidth']} clientWidth={overflow['clientWidth']} -- "
        "if this now passes with no overflow, the Navbar was fixed and this test (and the "
        "finding in the plan de pruebas) should be updated, not just loosened."
    )

    logout_button = page.get_by_role("button", name="Cerrar sesión")
    assert not logout_button.bounding_box() or logout_button.bounding_box()["x"] >= MOBILE_VIEWPORT["width"], (
        "expected the logout button to be positioned outside the visible viewport today"
    )


def test_navbar_overflow_is_consistent_across_protected_pages(page):
    # Same root cause (Navbar renders identically via ProtectedRoute on
    # every page), checked on a second, content-heavy page (a wide table)
    # to confirm it's not specific to the home page's own layout.
    login(page, *ADMIN_USER)
    page.set_viewport_size(MOBILE_VIEWPORT)
    page.goto(f"{BASE_URL}/invoices")

    overflow = _get_overflow(page)
    save_evidence(page, "test_navbar_overflow_is_consistent_across_protected_pages", "01_invoices_overflow")
    assert overflow["scrollWidth"] > overflow["clientWidth"]
