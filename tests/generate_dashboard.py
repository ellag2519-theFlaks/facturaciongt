"""Builds tests/reports/dashboard.html: a single browsable QA report that
ties together everything a reviewer needs from one run -- test type, test
scenario, outcome, the recorded video for that scenario, and a download link
for the full evidence presentation (evidencia.pptx).

This is the artifact meant to be opened from Jenkins' "Artefactos de la
compilación" list after a build: unlike report.html (pytest-html's raw
pass/fail/duration table) or the pptx (one slide per screenshot, meant for a
live presentation), this page is the single entry point a QA reviewer can
open in a browser and both READ the result and WATCH the evidence without
digging through tests/videos/ and tests/reports/ by hand.

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
PPTX_FILE = REPORTS_DIR / "evidencia.pptx"
VIDEOS_DIR = TESTS_DIR / "videos"

TYPE_LABELS = {
    "unitarias": "Unitaria",
    "funcionales": "Funcional",
    "no_funcionales": "No funcional",
    "integracion": "Integración",
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

        rows.append(
            {
                "type": _test_type(file_part),
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
        by_type.setdefault(row["type"], {"total": 0, "passed": 0})
        by_type[row["type"]]["total"] += 1
        if row["status_class"] in ("pass", "finding"):
            by_type[row["type"]]["passed"] += 1
    return total, passed, by_type


def render_html(rows):
    total, passed, by_type = build_summary(rows)
    generated_at = datetime.now().strftime("%Y-%m-%d %H:%M")

    type_summary_html = "".join(
        f'<div class="type-card"><div class="type-name">{_escape(t)}</div>'
        f'<div class="type-count">{counts["passed"]}/{counts["total"]}</div></div>'
        for t, counts in sorted(by_type.items())
    )

    rows_html = []
    for row in rows:
        video_cell = (
            f'<video controls preload="none" src="{_escape(row["video"])}"></video>'
            if row["video"]
            else '<span class="no-video">(sin video)</span>'
        )
        rows_html.append(
            f"""
            <tr>
              <td><span class="type-badge">{_escape(row["type"])}</span></td>
              <td>
                <div class="scenario-name">{_escape(row["scenario"])}</div>
                <div class="scenario-file">{_escape(row["file"])}</div>
              </td>
              <td><span class="status status-{row["status_class"]}">{_escape(row["status_label"])}</span></td>
              <td>{row["screenshot_count"]}</td>
              <td>{video_cell}</td>
            </tr>
            """
        )

    pptx_link_html = (
        f'<a class="pptx-button" href="evidencia.pptx" download>Descargar presentación de evidencias (PPTX)</a>'
        if PPTX_FILE.exists()
        else '<span class="pptx-missing">evidencia.pptx no encontrado -- corre generate_report.py</span>'
    )

    return f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>FacturaciónGT — Reporte de evidencias QA</title>
<style>
  body {{ font-family: -apple-system, Segoe UI, Arial, sans-serif; margin: 0; padding: 2rem; background: #f5f5f7; color: #1f2328; }}
  h1 {{ font-size: 1.5rem; margin-bottom: 0.25rem; }}
  .meta {{ color: #57606a; margin-bottom: 1.5rem; }}
  .summary {{ display: flex; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 1.5rem; }}
  .totals-card, .type-card {{ background: #fff; border: 1px solid #d0d7de; border-radius: 8px; padding: 0.75rem 1.25rem; min-width: 140px; }}
  .totals-card {{ font-weight: 600; }}
  .type-name {{ font-size: 0.8rem; color: #57606a; }}
  .type-count {{ font-size: 1.25rem; font-weight: 600; }}
  .pptx-button {{ display: inline-block; background: #1a7f37; color: #fff; text-decoration: none; padding: 0.6rem 1.1rem; border-radius: 6px; font-weight: 600; margin-bottom: 1.5rem; }}
  .pptx-missing {{ color: #cf222e; display: block; margin-bottom: 1.5rem; }}
  table {{ width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d0d7de; border-radius: 8px; overflow: hidden; }}
  th, td {{ text-align: left; padding: 0.6rem 0.9rem; border-bottom: 1px solid #eaeef2; vertical-align: top; }}
  th {{ background: #f6f8fa; font-size: 0.8rem; text-transform: uppercase; color: #57606a; }}
  .type-badge {{ background: #eaeef2; border-radius: 4px; padding: 0.15rem 0.5rem; font-size: 0.8rem; }}
  .scenario-name {{ font-weight: 600; }}
  .scenario-file {{ font-size: 0.78rem; color: #57606a; }}
  .status {{ border-radius: 4px; padding: 0.2rem 0.6rem; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }}
  .status-pass {{ background: #d9f2e3; color: #1a7f37; }}
  .status-fail {{ background: #ffe9e9; color: #cf222e; }}
  .status-finding {{ background: #fff1d6; color: #9a6700; }}
  video {{ max-width: 220px; border-radius: 4px; display: block; }}
  .no-video {{ color: #8c959f; font-size: 0.85rem; }}
</style>
</head>
<body>
  <h1>FacturaciónGT — Reporte de evidencias QA</h1>
  <div class="meta">Generado el {generated_at}</div>

  <div class="summary">
    <div class="totals-card">Total: {passed}/{total} pruebas pasaron</div>
    {type_summary_html}
  </div>

  {pptx_link_html}

  <table>
    <thead>
      <tr>
        <th>Tipo</th>
        <th>Escenario</th>
        <th>Resultado</th>
        <th>Capturas</th>
        <th>Video</th>
      </tr>
    </thead>
    <tbody>
      {"".join(rows_html)}
    </tbody>
  </table>
</body>
</html>
"""


def main():
    results = load_results()
    rows = build_rows(results)
    html = render_html(rows)
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(html, encoding="utf-8")
    print(f"Generado: {OUTPUT_FILE} ({len(rows)} escenarios)")


if __name__ == "__main__":
    main()
