"""Builds tests/reports/dashboard.html (+ dashboard.css): a single browsable
QA report that ties together everything a reviewer needs from one run --
test type, test scenario, outcome, the recorded video for that scenario,
and a download link for the full evidence presentation (evidencia.pptx).

This is the artifact meant to be opened from Jenkins' "Artefactos de la
compilación" list after a build: unlike report.html (pytest-html's raw
pass/fail/duration table) or the pptx (one slide per screenshot, meant for a
live presentation), this page is the single entry point a QA reviewer can
open in a browser and both READ the result and WATCH the evidence without
digging through tests/videos/ and tests/reports/ by hand.

*** Jenkins CSP note ***
Jenkins serves archived HTML artifacts under a restrictive
Content-Security-Policy (`sandbox allow-same-origin; default-src 'none';
img-src 'self'; style-src 'self';` by default) -- confirmed against a real
build (#16). Two consequences this file works around, and one it can't:
  - `style-src 'self'` has no `'unsafe-inline'`, so an inline <style> block
    gets silently stripped. Fix: all styling lives in a separate
    dashboard.css, loaded via <link rel="stylesheet"> (same-origin,
    allowed).
  - The `sandbox` token list is just `allow-same-origin` -- no
    `allow-scripts`, so this page is intentionally 100% script-free (any
    future interactivity must be pure CSS, e.g. <details>/<summary>).
  - What CANNOT be worked around from inside the page: `media-src` isn't
    set, so it falls back to `default-src 'none'` and blocks every
    <video src>; and without `allow-top-navigation`/`allow-popups`, even a
    plain <a href> click inside this sandboxed document is blocked (verified
    against build #16 -- the PPTX link didn't navigate). The video/PPTX
    links are still real relative links (useful once this file is opened
    outside Jenkins' wrapper, e.g. downloaded and opened locally, where no
    CSP applies) -- build_notice_html() tells the reader why they may look
    inert inside Jenkins and points at the one thing that still works
    there: Jenkins' own "Artefactos de la compilación" list on the build
    page, which is NOT subject to this document's CSP.

Reads the same tests/reports/results.json that generate_report.py reads, so
test type / finding classification stay defined in exactly one place
(imported from generate_report, not reimplemented here).

Run after the E2E suite (and ideally after generate_report.py, so the pptx
this page links to already exists):

    cd tests && py generate_dashboard.py
"""

import json
import re
from datetime import datetime
from pathlib import Path

from generate_report import FINDING_TESTS

TESTS_DIR = Path(__file__).parent
REPORTS_DIR = TESTS_DIR / "reports"
RESULTS_FILE = REPORTS_DIR / "results.json"
OUTPUT_FILE = REPORTS_DIR / "dashboard.html"
CSS_FILE = REPORTS_DIR / "dashboard.css"
PPTX_FILE = REPORTS_DIR / "evidencia.pptx"
VIDEOS_DIR = TESTS_DIR / "videos"

TYPE_LABELS = {
    "unitarias": "Unitaria",
    "funcionales": "Funcional",
    "no_funcionales": "No funcional",
    "integracion": "Integración",
}

# CSS class suffix per type label, so each gets a distinct accent color
# without hardcoding the label text into the stylesheet.
TYPE_SLUGS = {
    "Unitaria": "unitaria",
    "Funcional": "funcional",
    "No funcional": "no-funcional",
    "Integración": "integracion",
}


def _slugify(test_id):
    """Reproduces pytest-playwright's video-directory naming: every run of
    non-alphanumeric characters in the test id becomes a single "-". E.g.
    'test_auth_pruebas_funcionales.py::test_admin_login_success[chromium]'
    -> 'test-auth-pruebas-funcionales-py-test-admin-login-success-chromium'
    (verified against the actual tests/videos/ directory names)."""
    return re.sub(r"[^A-Za-z0-9]+", "-", test_id).strip("-")


def _test_type(file_part):
    """Extracts the test type from a '..._pruebas_<tipo>.py' filename, e.g.
    'test_auth_pruebas_funcionales.py' -> 'Funcional'. Falls back to the raw
    suffix (title-cased) for any type not in TYPE_LABELS, so a future type
    never renders blank."""
    match = re.search(r"_pruebas_(.+)\.py$", file_part)
    if not match:
        return "Sin clasificar"
    key = match.group(1)
    return TYPE_LABELS.get(key, key.replace("_", " ").title())


def _video_path(test_id):
    video_file = VIDEOS_DIR / _slugify(test_id) / "video.webm"
    if not video_file.exists():
        return None
    return f"../videos/{_slugify(test_id)}/video.webm"


def _escape(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def load_results():
    if not RESULTS_FILE.exists():
        raise SystemExit(f"No se encontró {RESULTS_FILE}. Ejecuta la suite de pruebas primero.")

    results = []
    with open(RESULTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                results.append(json.loads(line))
    return results


def build_rows(results):
    rows = []
    for result in results:
        test_id = result["test_id"]
        file_part = test_id.split("::")[0]
        scenario = test_id.split("::")[-1].split("[")[0]
        is_finding = scenario in FINDING_TESTS
        outcome = result["outcome"]
        is_pass = outcome == "passed"

        if is_finding:
            status_label = "HALLAZGO CONFIRMADO" if is_pass else "HALLAZGO NO REPRODUCIDO"
            status_class = "finding"
        else:
            status_label = "PASÓ" if is_pass else "FALLÓ"
            status_class = "pass" if is_pass else "fail"

        test_type = _test_type(file_part)
        rows.append(
            {
                "type": test_type,
                "type_slug": TYPE_SLUGS.get(test_type, "otro"),
                "file": file_part,
                "scenario": scenario,
                "status_label": status_label,
                "status_class": status_class,
                "video": _video_path(test_id),
                "screenshot_count": len(result.get("screenshots", [])),
            }
        )
    return rows


def build_summary(rows):
    total = len(rows)
    passed = sum(1 for r in rows if r["status_class"] in ("pass", "finding"))
    by_type = {}
    for row in rows:
        by_type.setdefault(row["type"], {"total": 0, "passed": 0, "slug": row["type_slug"]})
        by_type[row["type"]]["total"] += 1
        if row["status_class"] in ("pass", "finding"):
            by_type[row["type"]]["passed"] += 1
    return total, passed, by_type


def build_notice_html():
    return """
    <div class="notice">
      <strong>¿Los videos no se reproducen o los botones no responden?</strong>
      Si estás viendo este reporte directamente dentro de Jenkins, es por su
      política de seguridad para archivos HTML archivados (bloquea video y
      navegación de enlaces dentro de la página). Para reproducir un video o
      descargar el PPTX desde ahí, usa la lista
      <strong>&ldquo;Artefactos de la compilación&rdquo;</strong> en la
      página de la build, o descarga y abre este archivo localmente para
      verlo con toda la interactividad.
    </div>
    """


def render_html(rows):
    total, passed, by_type = build_summary(rows)
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    all_passed = passed == total

    type_summary_html = "".join(
        f'<div class="stat-card stat-{counts["slug"]}">'
        f'<div class="stat-count">{counts["passed"]}/{counts["total"]}</div>'
        f'<div class="stat-label">{_escape(t)}</div>'
        f"</div>"
        for t, counts in sorted(by_type.items())
    )

    cards_html = []
    for row in rows:
        video_cell = (
            f'<a class="video-link" href="{_escape(row["video"])}">&#9654; Ver video</a>'
            if row["video"]
            else '<span class="no-video">Sin video</span>'
        )
        cards_html.append(
            f"""
            <article class="test-card type-{row["type_slug"]}">
              <div class="test-card-main">
                <span class="type-badge type-{row["type_slug"]}">{_escape(row["type"])}</span>
                <div class="scenario-name">{_escape(row["scenario"])}</div>
                <div class="scenario-file">{_escape(row["file"])}</div>
              </div>
              <div class="test-card-meta">
                <span class="status status-{row["status_class"]}">{_escape(row["status_label"])}</span>
                <span class="shot-count">{row["screenshot_count"]} captura(s)</span>
                {video_cell}
              </div>
            </article>
            """
        )

    pptx_link_html = (
        '<a class="pptx-button" href="evidencia.pptx" download>'
        "&#11015; Descargar presentación de evidencias (PPTX)</a>"
        if PPTX_FILE.exists()
        else '<span class="pptx-missing">evidencia.pptx no encontrado -- corre generate_report.py</span>'
    )

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>FacturaciónGT — Reporte de evidencias QA</title>
<link rel="stylesheet" href="dashboard.css">
</head>
<body>
  <header class="page-header">
    <h1>FacturaciónGT</h1>
    <p class="subtitle">Reporte de evidencias QA</p>
    <p class="meta">Generado el {generated_at}</p>
  </header>

  <main>
    <section class="summary">
      <div class="stat-card stat-total {"stat-total-ok" if all_passed else "stat-total-bad"}">
        <div class="stat-count">{passed}/{total}</div>
        <div class="stat-label">Total de pruebas</div>
      </div>
      {type_summary_html}
    </section>

    {build_notice_html()}

    {pptx_link_html}

    <section class="test-list">
      {"".join(cards_html)}
    </section>
  </main>
</body>
</html>
"""


CSS = """
:root {
  --bg: #f3f4f8;
  --card-bg: #ffffff;
  --border: #e2e5ec;
  --text: #1f2430;
  --text-muted: #6b7280;
  --blue: #2563eb;
  --purple: #7c3aed;
  --teal: #0d9488;
  --amber: #d97706;
  --gray: #6b7280;
  --green: #15803d;
  --green-bg: #dcfce7;
  --red: #b91c1c;
  --red-bg: #fee2e2;
  --finding: #92400e;
  --finding-bg: #fef3c7;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: "Segoe UI", -apple-system, Roboto, Arial, sans-serif;
  background: var(--bg);
  color: var(--text);
}

.page-header {
  background: linear-gradient(135deg, #1e293b, #334155 55%, #3730a3);
  color: #fff;
  padding: 2.5rem 2rem 2rem;
  text-align: center;
}

.page-header h1 {
  margin: 0;
  font-size: 2rem;
  letter-spacing: 0.02em;
}

.page-header .subtitle {
  margin: 0.25rem 0 0;
  font-size: 1.05rem;
  color: #cbd5e1;
}

.page-header .meta {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: #94a3b8;
}

main {
  max-width: 980px;
  margin: 0 auto;
  padding: 2rem 1.5rem 3rem;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  flex: 1 1 140px;
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-top: 4px solid var(--gray);
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

.stat-count {
  font-size: 1.6rem;
  font-weight: 700;
}

.stat-label {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-top: 0.15rem;
}

.stat-total { border-top-color: var(--text); }
.stat-total-ok .stat-count { color: var(--green); }
.stat-total-bad .stat-count { color: var(--red); }

.stat-funcional { border-top-color: var(--blue); }
.stat-no-funcional { border-top-color: var(--purple); }
.stat-unitaria { border-top-color: var(--teal); }
.stat-integracion { border-top-color: var(--amber); }

.notice {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e3a5f;
  border-radius: 10px;
  padding: 0.85rem 1.1rem;
  font-size: 0.88rem;
  line-height: 1.5;
  margin-bottom: 1.25rem;
}

.pptx-button {
  display: inline-block;
  background: var(--green);
  color: #fff;
  text-decoration: none;
  padding: 0.7rem 1.3rem;
  border-radius: 8px;
  font-weight: 600;
  margin-bottom: 1.75rem;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
}

.pptx-missing { color: var(--red); display: block; margin-bottom: 1.5rem; }

.test-list {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.test-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-left: 5px solid var(--gray);
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.03);
}

.test-card.type-funcional { border-left-color: var(--blue); }
.test-card.type-no-funcional { border-left-color: var(--purple); }
.test-card.type-unitaria { border-left-color: var(--teal); }
.test-card.type-integracion { border-left-color: var(--amber); }

.test-card-main { min-width: 220px; }

.type-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  margin-bottom: 0.3rem;
  color: #fff;
}

.type-badge.type-funcional { background: var(--blue); }
.type-badge.type-no-funcional { background: var(--purple); }
.type-badge.type-unitaria { background: var(--teal); }
.type-badge.type-integracion { background: var(--amber); }
.type-badge.type-otro { background: var(--gray); }

.scenario-name { font-weight: 600; }
.scenario-file { font-size: 0.78rem; color: var(--text-muted); margin-top: 0.1rem; }

.test-card-meta {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  flex-wrap: wrap;
}

.status {
  border-radius: 999px;
  padding: 0.25rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}

.status-pass { background: var(--green-bg); color: var(--green); }
.status-fail { background: var(--red-bg); color: var(--red); }
.status-finding { background: var(--finding-bg); color: var(--finding); }

.shot-count { font-size: 0.82rem; color: var(--text-muted); }

.video-link {
  color: var(--blue);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.85rem;
}

.video-link:hover { text-decoration: underline; }

.no-video { font-size: 0.82rem; color: #9ca3af; }

@media (max-width: 600px) {
  .page-header { padding: 2rem 1.25rem 1.5rem; }
  main { padding: 1.5rem 1rem 2rem; }
  .test-card { flex-direction: column; align-items: flex-start; }
}
"""


def main():
    results = load_results()
    rows = build_rows(results)
    html = render_html(rows)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    CSS_FILE.write_text(CSS, encoding="utf-8")
    print(f"Generado: {OUTPUT_FILE} y {CSS_FILE} ({len(rows)} escenarios)")


if __name__ == "__main__":
    main()
