"""Task 16: auto-generates a PowerPoint QA evidence deck from a test run.

Reads tests/reports/results.json (Task 8's schema, truncated and rewritten
fresh by conftest.py's pytest_configure hook on every pytest invocation --
see conftest.py) and tests/evidence/*.png (written by conftest.py's
save_evidence() during the run), and writes tests/reports/evidencia.pptx:

  1. A title slide.
  2. One slide per test result line in results.json (in the order they were
     written, i.e. the order pytest ran them), showing every screenshot
     recorded for that test plus a colored PASO/FALLO label driven by the
     real "outcome" field from the JSON -- never hardcoded.
  3. Closing "validated code" slides: for each of the 7 real E2E test files,
     one slide per top-level `def test_...` function, titled with the
     function name and containing its exact source text (via
     ast.get_source_segment) in a monospace textbox.

Run from the tests/ directory (after a fresh `pytest --video=on
--html=reports/report.html -v` run so results.json/evidence/ are current):

    cd tests && py generate_report.py
"""

import ast
import json
from datetime import date
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_AUTO_SIZE

TESTS_DIR = Path(__file__).parent
REPORTS_DIR = TESTS_DIR / "reports"
RESULTS_FILE = REPORTS_DIR / "results.json"
OUTPUT_FILE = REPORTS_DIR / "evidencia.pptx"

CODE_FILES = [
    "test_auth_pruebas_funcionales.py",
    "test_products_pruebas_funcionales.py",
    "test_invoices_pruebas_funcionales.py",
    "test_stock_limits_pruebas_funcionales.py",
    "test_usd_payment_pruebas_funcionales.py",
    "test_compatibility_pruebas_no_funcionales.py",
    "test_volume_pruebas_no_funcionales.py",
]

SLIDE_WIDTH = Inches(13.333)
SLIDE_HEIGHT = Inches(7.5)

COLOR_PASS = RGBColor(0x1E, 0x8E, 0x3E)   # green
COLOR_FAIL = RGBColor(0xC5, 0x22, 0x1F)   # red
COLOR_FINDING = RGBColor(0xB8, 0x6E, 0x00)  # amber -- neither "good" nor "bad"
COLOR_DARK = RGBColor(0x20, 0x20, 0x20)
COLOR_LIGHT_BG = RGBColor(0xF5, 0xF5, 0xF5)

# Tests that document a KNOWN, DELIBERATELY UNFIXED gap rather than validate
# a feature -- the test "passing" means the gap was confirmed to still
# exist, not that something works correctly. A green "PASÓ" badge on these
# would read backwards.
#
# NF-COMP-01's Navbar-overflow gap (the only entries this set ever held) was
# fixed 2026-10-12 and its 2 tests were flipped into regression tests
# (test_navbar_does_not_overflow_on_mobile_viewport /
# test_navbar_no_overflow_is_consistent_across_protected_pages) -- they now
# validate a feature like any other functional test, so this set is empty
# until a future gap is deliberately left undocumented-as-fixed again.
FINDING_TESTS = set()


def _blank_slide(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])  # blank layout


def _add_title_text(slide, text, top=Inches(0.3), height=Inches(0.9), size=28, bold=True, color=COLOR_DARK, align=PP_ALIGN.LEFT):
    box = slide.shapes.add_textbox(Inches(0.4), top, SLIDE_WIDTH - Inches(0.8), height)
    tf = box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return box


def build_title_slide(prs):
    slide = _blank_slide(prs)
    _add_title_text(
        slide,
        "Evidencias de QA — Sistema de Facturación",
        top=Inches(3.0),
        height=Inches(1.0),
        size=40,
        align=PP_ALIGN.CENTER,
    )
    subtitle = slide.shapes.add_textbox(Inches(0.4), Inches(4.0), SLIDE_WIDTH - Inches(0.8), Inches(0.6))
    tf = subtitle.text_frame
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = date.today().strftime("%Y-%m-%d")
    run.font.size = Pt(20)
    run.font.color.rgb = COLOR_DARK


def _add_outcome_badge(slide, is_pass, test_name):
    """Top-right badge. For a normal test, PASO/FALLO colored strictly by
    the real outcome -- never hardcoded to PASO. For a FINDING_TESTS entry,
    "PASÓ" would read backwards (the test passing means a known gap was
    confirmed to still exist, not that something works), so it gets its
    own neutral amber label instead of green/red."""
    if test_name in FINDING_TESTS:
        label_text = "HALLAZGO CONFIRMADO" if is_pass else "HALLAZGO NO REPRODUCIDO"
        label_color = COLOR_FINDING
        font_size = 16
        box_width = Inches(3.6)
    else:
        label_text = "PASÓ" if is_pass else "FALLÓ"
        label_color = COLOR_PASS if is_pass else COLOR_FAIL
        font_size = 24
        box_width = Inches(1.8)

    badge = slide.shapes.add_textbox(SLIDE_WIDTH - Inches(0.4) - box_width, Inches(0.25), box_width, Inches(0.6))
    tf = badge.text_frame
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.RIGHT
    run = p.add_run()
    run.text = label_text
    run.font.size = Pt(font_size)
    run.font.bold = True
    run.font.color.rgb = label_color


def _step_label(screenshot_path, test_name):
    """Extracts the descriptive step name a test gave save_evidence(), e.g.
    'evidence/test_foo__02_invoice_created.png' -> '02 invoice created'.
    Falls back to the bare filename if the expected '{test_name}__' prefix
    isn't there, so a slide never ships with no label at all."""
    filename = Path(screenshot_path).stem
    prefix = f"{test_name}__"
    step = filename[len(prefix):] if filename.startswith(prefix) else filename
    return step.replace("_", " ")


def build_result_slides(prs, result):
    """One or more slides per entry in results.json: an intro slide with the
    test name and PASO/FALLO badge, then ONE SLIDE PER SCREENSHOT -- each
    large enough to actually read on a projector, labeled with its step name
    (from the evidence filename) so it's never an unlabeled image next to a
    bare "PASÓ". Putting 3-4 screenshots side by side on one slide (the
    previous layout) shrank each one to ~3in wide, too small to read any UI
    text in it -- this trades slide count for legibility on purpose.
    """
    test_id = result["test_id"]
    test_name = test_id.split("::")[-1].split("[")[0]
    outcome = result["outcome"]
    screenshots = result.get("screenshots", [])
    is_pass = outcome == "passed"

    intro = _blank_slide(prs)
    _add_title_text(intro, test_name, top=Inches(0.25), height=Inches(0.7), size=22)
    _add_outcome_badge(intro, is_pass, test_name)

    if not screenshots:
        empty = intro.shapes.add_textbox(Inches(0.4), Inches(1.2), SLIDE_WIDTH - Inches(0.8), Inches(0.6))
        run = empty.text_frame.paragraphs[0].add_run()
        run.text = "(sin capturas registradas)"
        run.font.size = Pt(16)
        run.font.italic = True
        return

    count_note = intro.shapes.add_textbox(Inches(0.4), Inches(1.2), SLIDE_WIDTH - Inches(0.8), Inches(0.6))
    run = count_note.text_frame.paragraphs[0].add_run()
    run.text = f"{len(screenshots)} captura(s) — una por diapositiva a continuación"
    run.font.size = Pt(16)
    run.font.italic = True

    # Large, legible image area, sized to the available slide space minus
    # title/label room. The box itself is landscape, but each screenshot is
    # fit to ITS OWN real pixel aspect ratio inside it (see loop below) --
    # not forced to 1280x720. The suite also records 375x812 portrait
    # screenshots (mobile-viewport compatibility tests), and stretching
    # those into a 16:9 box distorted them ~3.4x horizontally, unreadable
    # for a manual QA reviewer.
    img_top = Inches(1.35)
    available_width = SLIDE_WIDTH - Inches(0.8)
    available_height = SLIDE_HEIGHT - img_top - Inches(0.3)

    for shot in screenshots:
        slide = _blank_slide(prs)
        _add_title_text(slide, test_name, top=Inches(0.25), height=Inches(0.55), size=20)
        _add_outcome_badge(slide, is_pass, test_name)

        step_box = slide.shapes.add_textbox(Inches(0.4), Inches(0.85), SLIDE_WIDTH - Inches(0.8), Inches(0.45))
        run = step_box.text_frame.paragraphs[0].add_run()
        run.text = f"Paso: {_step_label(shot, test_name)}"
        run.font.size = Pt(18)
        run.font.bold = True
        run.font.color.rgb = COLOR_DARK

        img_path = TESTS_DIR / shot
        if img_path.exists():
            with Image.open(img_path) as im:
                px_w, px_h = im.size
            scale = min(available_width / px_w, available_height / px_h)
            img_width = int(px_w * scale)
            img_height = int(px_h * scale)
            img_left = int((SLIDE_WIDTH - img_width) / 2)
            img_slide_top = int(img_top + (available_height - img_height) / 2)
            slide.shapes.add_picture(str(img_path), Emu(img_left), Emu(img_slide_top), width=Emu(img_width), height=Emu(img_height))
        else:
            img_left = int((SLIDE_WIDTH - available_width) / 2)
            missing = slide.shapes.add_textbox(Emu(img_left), img_top, Emu(int(available_width)), Emu(int(available_height)))
            run = missing.text_frame.paragraphs[0].add_run()
            run.text = f"(imagen no encontrada: {shot})"
            run.font.size = Pt(12)
            run.font.italic = True


def iter_top_level_test_functions(source, tree):
    """Yield (function_name, source_segment) for every top-level `def test_...`."""
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
            segment = ast.get_source_segment(source, node)
            yield node.name, segment


def _font_size_for_line_count(num_lines):
    """Nominal monospace size, tiered by how many lines the function is.

    The point of tiering (instead of one fixed size for every code slide)
    is that this codebase's test functions range from 5 lines
    (test_admin_login_success) to 66 lines
    (test_backend_rejects_insufficient_stock_and_leaves_stock_unchanged):
    a single size chosen to make the 66-line function fit would force
    every short 4-5 line function into that same tiny, unnecessarily hard
    to read size despite having a nearly-empty slide. Instead, short
    functions get a large, comfortably readable size, and only the
    genuinely long ones step down.
    """
    if num_lines <= 8:
        return 20
    if num_lines <= 16:
        return 18
    if num_lines <= 26:
        return 15
    if num_lines <= 45:
        return 12
    return 10


def build_code_slide(prs, filename, function_name, code_text):
    slide = _blank_slide(prs)
    _add_title_text(slide, f"{filename} — {function_name}", top=Inches(0.2), height=Inches(0.55), size=20)

    box = slide.shapes.add_textbox(Inches(0.4), Inches(0.9), SLIDE_WIDTH - Inches(0.8), SLIDE_HEIGHT - Inches(1.15))
    box.fill.solid()
    box.fill.fore_color.rgb = COLOR_LIGHT_BG
    tf = box.text_frame
    tf.word_wrap = True
    # Safety net for the longest functions (e.g. the 66-line stock-limits
    # test): if the tiered nominal size below still overflows this box,
    # PowerPoint shrinks it further on render rather than clipping/cutting
    # off any of the source text. Short functions never hit this path
    # since they fit comfortably at their tier's nominal size.
    tf.auto_size = MSO_AUTO_SIZE.TEXT_TO_FIT_SHAPE

    lines = code_text.splitlines() or [code_text]
    font_size = _font_size_for_line_count(len(lines))

    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        run = p.add_run()
        run.text = line if line != "" else " "
        run.font.name = "Consolas"
        run.font.size = Pt(font_size)
        run.font.color.rgb = COLOR_DARK


def build_code_section_divider(prs):
    """Explains what the following slides are, so a viewer flipping from
    the last screenshot straight into source code isn't left guessing --
    this was confusing before this divider existed."""
    slide = _blank_slide(prs)
    _add_title_text(
        slide,
        "Código fuente de las pruebas automatizadas",
        top=Inches(2.6),
        height=Inches(1.0),
        size=32,
        align=PP_ALIGN.CENTER,
    )
    subtitle = slide.shapes.add_textbox(Inches(1.2), Inches(3.7), SLIDE_WIDTH - Inches(2.4), Inches(1.5))
    tf = subtitle.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = (
        "A continuación, el código exacto de cada prueba mostrada arriba -- "
        "una diapositiva por función de prueba, para evidenciar precisamente "
        "qué se validó en cada escenario, no solo el resultado."
    )
    run.font.size = Pt(18)
    run.font.color.rgb = COLOR_DARK


def build_closing_code_slides(prs):
    for filename in CODE_FILES:
        path = TESTS_DIR / filename
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=filename)
        for function_name, code_text in iter_top_level_test_functions(source, tree):
            build_code_slide(prs, filename, function_name, code_text)


def main():
    if not RESULTS_FILE.exists():
        raise SystemExit(f"No se encontró {RESULTS_FILE}. Ejecuta la suite de pruebas primero.")

    results = []
    with open(RESULTS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                results.append(json.loads(line))

    prs = Presentation()
    prs.slide_width = SLIDE_WIDTH
    prs.slide_height = SLIDE_HEIGHT

    build_title_slide(prs)

    for result in results:
        build_result_slides(prs, result)

    build_code_section_divider(prs)
    build_closing_code_slides(prs)

    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUTPUT_FILE))
    print(f"Generado: {OUTPUT_FILE} ({len(prs.slides)} slides)")


if __name__ == "__main__":
    main()
