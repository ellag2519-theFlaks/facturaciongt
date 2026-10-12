# tests/test_compatibility_pruebas_no_funcionales.py
"""NF-COMP-01 (plan de pruebas, Fase 2): compatibilidad responsive en un
viewport móvil emulado (375x812, equivalente a un iPhone SE/8).

*** HALLAZGO CORREGIDO (actualizado 2026-10-12) ***
Esta suite documentó originalmente un desbordamiento horizontal real: el
Navbar (frontend/src/components/Navbar.jsx) no tenía tratamiento responsive
-- en 375px de ancho, el link "Productos" quedaba cortado y el bloque de
usuario/rol + "Cerrar sesión" caían completamente fuera del viewport
(scrollWidth 555 vs clientWidth 375). Las aserciones originales confirmaban
que el desbordamiento EXISTÍA, con un mensaje explícito avisando que si
algún día dejaban de fallar, el Navbar se había corregido y las pruebas
debían actualizarse -- no solo relajarse.

Ese día llegó: tras reportarse el mismo síntoma desde un dispositivo móvil
real (video "Pruebas responsive", 2026-10-12), el Navbar se corrigió
(flex-wrap + NavLink `end`, ver Navbar.jsx) y build #13 del pipeline hizo
fallar estas pruebas exactamente como su propio mensaje anticipaba
(scrollWidth=375 clientWidth=375 -- sin desbordamiento). Las aserciones se
invirtieron para convertir estas 2 pruebas de documentación de un hallazgo a
pruebas de regresión que confirman que el Navbar NO vuelve a desbordar.

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


def test_navbar_does_not_overflow_on_mobile_viewport(page):
    login(page, *ADMIN_USER)
    page.set_viewport_size(MOBILE_VIEWPORT)
    page.goto(f"{BASE_URL}/")

    overflow = _get_overflow(page)
    save_evidence(page, "test_navbar_does_not_overflow_on_mobile_viewport", "01_home_no_overflow")

    assert overflow["scrollWidth"] <= overflow["clientWidth"], (
        f"expected no horizontal overflow (scrollWidth <= clientWidth), got "
        f"scrollWidth={overflow['scrollWidth']} clientWidth={overflow['clientWidth']} -- "
        "the Navbar's flex-wrap regressed."
    )

    # The logout button must now be reachable WITHOUT horizontal scrolling --
    # the opposite of what this test asserted before the fix.
    logout_button = page.get_by_role("button", name="Cerrar sesión")
    box = logout_button.bounding_box()
    assert box is not None and box["x"] + box["width"] <= MOBILE_VIEWPORT["width"], (
        "expected the logout button to be fully within the visible viewport"
    )


def test_navbar_no_overflow_is_consistent_across_protected_pages(page):
    # Same root cause/fix (Navbar renders identically via ProtectedRoute on
    # every page), checked on a second, content-heavy page (a wide table)
    # to confirm the fix isn't specific to the home page's own layout.
    login(page, *ADMIN_USER)
    page.set_viewport_size(MOBILE_VIEWPORT)
    page.goto(f"{BASE_URL}/invoices")

    overflow = _get_overflow(page)
    save_evidence(page, "test_navbar_no_overflow_is_consistent_across_protected_pages", "01_invoices_no_overflow")
    assert overflow["scrollWidth"] <= overflow["clientWidth"]
