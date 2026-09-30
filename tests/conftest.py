"""Shared E2E test harness: config constants, login/evidence helpers, and the
results.json reporting hook consumed by generate_report.py (Task 16).

See tests/.env.example for the environment variables that override the
defaults below.
"""

import json
import os
from pathlib import Path

import pytest

TESTS_DIR = Path(__file__).parent
EVIDENCE_DIR = TESTS_DIR / "evidence"
REPORTS_DIR = TESTS_DIR / "reports"
RESULTS_FILE = REPORTS_DIR / "results.json"

BASE_URL = os.environ.get("BASE_URL", "http://localhost:5173")

ADMIN_USER = (
    os.environ.get("ADMIN_USERNAME", "admin"),
    os.environ.get("ADMIN_PASSWORD", "admin123"),
)

VENDEDOR_USER = (
    os.environ.get("VENDEDOR_USERNAME", "vendedor"),
    os.environ.get("VENDEDOR_PASSWORD", "vendedor123"),
)

# Populated by save_evidence(); read by pytest_runtest_makereport below.
# Keyed by test_name (the bare test function name), NOT by the Playwright
# Page object -- Task 16's generate_report.py depends on this exact schema.
_SCREENSHOTS: dict[str, list[str]] = {}


def login(page, username, password):
    """Log in through the real login form and wait for navigation away from /login."""
    login_url = f"{BASE_URL}/login"
    page.goto(login_url)
    page.get_by_label("Usuario").fill(username)
    page.get_by_label("Contraseña").fill(password)
    page.get_by_role("button", name="Ingresar").click()
    page.wait_for_url(lambda url: url != login_url)


def save_evidence(page, test_name: str, step_name: str) -> str:
    """Screenshot the current page state and record it against test_name.

    Saves to tests/evidence/{test_name}__{step_name}.png (creating the
    directory if needed), returns the path relative to the tests/ dir, and
    appends that path to _SCREENSHOTS[test_name] so the reporting hook can
    pick it up without touching the Page object itself.
    """
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    filename = f"{test_name}__{step_name}.png"
    absolute_path = EVIDENCE_DIR / filename
    page.screenshot(path=str(absolute_path))

    relative_path = f"evidence/{filename}"
    _SCREENSHOTS.setdefault(test_name, []).append(relative_path)
    return relative_path


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()

    if report.when == "call":
        REPORTS_DIR.mkdir(parents=True, exist_ok=True)
        # pytest-playwright parametrizes every test on browser_name, so
        # item.name is e.g. "test_admin_login_success[chromium]" while
        # test_auth.py calls save_evidence() with the bare function name.
        # item.originalname is pytest's own bare name (falls back to
        # item.name when a test isn't parametrized), so it's what actually
        # matches the test_name string passed to save_evidence().
        test_name = getattr(item, "originalname", None) or item.name
        result = {
            "test_id": item.nodeid,
            "outcome": "passed" if report.passed else "failed",
            "screenshots": _SCREENSHOTS.get(test_name, []),
        }
        with open(RESULTS_FILE, "a", encoding="utf-8") as results_file:
            results_file.write(json.dumps(result) + "\n")
