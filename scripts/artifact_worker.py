"""Real local artifact ingestion/generation worker.

JSON request/response over stdin/stdout keeps document libraries out of the
Electron renderer and makes file operations auditable and cancellable.
"""
from __future__ import annotations
import json, os, sys, shutil, subprocess, tempfile
from pathlib import Path

def fail(message: str):
    print(json.dumps({"ok": False, "error": message}), flush=True)
    raise SystemExit(1)

def ocr_image_file(image_path: Path) -> str:
    """Run a real installed OCR engine; never substitute model-generated text."""
    executable = os.environ.get("TESSERACT_PATH") or shutil.which("tesseract")
    candidates = [executable, r"C:\Program Files\Tesseract-OCR\tesseract.exe", r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"]
    executable = next((item for item in candidates if item and Path(item).exists()), None)
    if not executable: raise RuntimeError("OCR unavailable: install Tesseract OCR or configure TESSERACT_PATH.")
    result = subprocess.run([executable, str(image_path), "stdout", "--psm", "3"], capture_output=True, text=True, timeout=30, check=True)
    return result.stdout.strip()

def ocr_image_bytes(image_bytes: bytes) -> str:
    """OCR an embedded package image using a short-lived private temp file."""
    with tempfile.TemporaryDirectory(prefix="sara-embedded-ocr-") as directory:
        image_path = Path(directory) / "embedded-image.png"
        image_path.write_bytes(image_bytes)
        return ocr_image_file(image_path)

def ocr_pdf_page(pdf_path: Path, page_no: int) -> str:
    renderer = shutil.which("pdftoppm") or os.environ.get("PDFTOPPM_PATH")
    if not renderer: raise RuntimeError("OCR unavailable: PDF renderer pdftoppm was not found.")
    with tempfile.TemporaryDirectory(prefix="sara-ocr-") as directory:
        output = Path(directory) / "page"
        subprocess.run([renderer, "-f", str(page_no), "-l", str(page_no), "-singlefile", "-png", str(pdf_path), str(output)], capture_output=True, timeout=30, check=True)
        return ocr_image_file(output.with_suffix(".png"))

def generate(req):
    path = Path(req["path"]).resolve()
    if path.exists() and not req.get("overwrite", False): fail("Destination exists; explicit overwrite is required.")
    path.parent.mkdir(parents=True, exist_ok=True)
    fmt = req["format"].lower(); title = str(req.get("title") or "Sara document"); content = str(req.get("content") or "")
    if fmt in ("md", "markdown", "txt", "code"):
        path.write_text((f"# {title}\n\n" if fmt in ("md", "markdown") else "") + content, encoding="utf-8")
    elif fmt == "pdf":
        from reportlab.lib.pagesizes import letter
        from reportlab.pdfgen import canvas
        c = canvas.Canvas(str(path), pagesize=letter); c.setTitle(title)
        y = 760
        for line in (title + "\n\n" + content).splitlines():
            if y < 50: c.showPage(); y = 760
            c.drawString(54, y, line[:110]); y -= 15
        c.save()
    elif fmt == "docx":
        from docx import Document
        doc = Document(); doc.add_heading(title, 0)
        for block in content.split("\n\n"): doc.add_paragraph(block)
        doc.save(str(path))
    elif fmt == "xlsx":
        from openpyxl import Workbook
        wb = Workbook(); ws = wb.active; ws.title = "Report"; ws["A1"] = title
        for row, line in enumerate(content.splitlines(), 3): ws.cell(row, 1, line)
        ws.freeze_panes = "A3"; wb.save(str(path))
    elif fmt == "pptx":
        from pptx import Presentation
        prs = Presentation()
        for index, block in enumerate([b for b in content.split("\n\n") if b.strip()] or [content], 1):
            slide = prs.slides.add_slide(prs.slide_layouts[1]); slide.shapes.title.text = f"{title} {index}"; slide.placeholders[1].text = block
        prs.save(str(path))
    else: fail(f"Unsupported format: {fmt}")
    return {"ok": True, "path": str(path), "format": fmt, "size": path.stat().st_size}

def extract(req):
    path = Path(req["path"]).resolve(); suffix = path.suffix.lower(); citations = []; text = ""
    if suffix in (".txt", ".md", ".csv", ".json", ".py", ".ts", ".js"):
        text = path.read_text(encoding="utf-8", errors="replace")
        citations = [{"location": "file", "text": text[:1000]}]
    elif suffix == ".pdf":
        from pypdf import PdfReader
        for page_no, page in enumerate(PdfReader(str(path)).pages, 1):
            value = page.extract_text() or ""; text += value + "\n"; citation = {"page": page_no, "text": value[:2000]}; citations.append(citation)
            page_has_images = False
            try: page_has_images = bool(page.images)
            except Exception: pass
            if not value.strip() or page_has_images:
                try:
                    ocr_value = ocr_pdf_page(path, page_no)
                    if ocr_value:
                        text += ocr_value + "\n"; citation["ocrText"] = ocr_value[:2000]; citation["method"] = "text+ocr" if value.strip() else "ocr"
                except Exception as error:
                    citation["ocr"] = "unavailable"; citation["ocrError"] = str(error)
    elif suffix in (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"):
        value = ocr_image_file(path); text = value; citations = [{"image": str(path.name), "text": value[:2000], "method": "ocr"}]
    elif suffix == ".docx":
        from docx import Document
        doc = Document(str(path))
        for index, para in enumerate(doc.paragraphs, 1):
            if para.text.strip(): text += para.text + "\n"; citations.append({"paragraph": index, "text": para.text[:2000]})
        for index, shape in enumerate(doc.inline_shapes, 1):
            try:
                rid = shape._inline.graphic.graphicData.pic.blipFill.blip.embed
                image = doc.part.related_parts[rid]
                value = ocr_image_bytes(image.blob)
                if value:
                    text += value + "\n"; citations.append({"image": index, "location": "embedded document image", "text": value[:2000], "method": "ocr"})
            except Exception as error:
                citations.append({"image": index, "location": "embedded document image", "ocr": "unavailable", "ocrError": str(error)})
    elif suffix == ".xlsx":
        from openpyxl import load_workbook
        # Normal mode is required here: openpyxl's read-only worksheets do not
        # expose drawing images, which are needed for sheet-level OCR citations.
        wb = load_workbook(str(path), data_only=False, read_only=False, keep_links=False)
        for ws in wb.worksheets:
            for row in ws.iter_rows():
                values = ["" if cell.value is None else str(cell.value) for cell in row]
                if any(values): text += "\t".join(values) + "\n"; citations.append({"sheet": ws.title, "row": row[0].row, "text": "\t".join(values)[:2000]})
            for index, image in enumerate(getattr(ws, "_images", []), 1):
                try:
                    anchor = getattr(image, "anchor", None); start = getattr(anchor, "_from", None)
                    location = f"{ws.title}!image-{index}"
                    if start is not None: location = f"{ws.title}!row-{start.row + 1}-column-{start.col + 1}-image-{index}"
                    value = ocr_image_bytes(image._data())
                    if value:
                        text += value + "\n"; citations.append({"sheet": ws.title, "image": index, "location": location, "text": value[:2000], "method": "ocr"})
                except Exception as error:
                    citations.append({"sheet": ws.title, "image": index, "ocr": "unavailable", "ocrError": str(error)})
        wb.close()
    elif suffix == ".pptx":
        from pptx.enum.shapes import MSO_SHAPE_TYPE
        from pptx import Presentation
        for index, slide in enumerate(Presentation(str(path)).slides, 1):
            value = "\n".join(shape.text for shape in slide.shapes if hasattr(shape, "text")); text += value + "\n"; citations.append({"slide": index, "text": value[:2000]})
            image_index = 0
            for shape in slide.shapes:
                if shape.shape_type != MSO_SHAPE_TYPE.PICTURE: continue
                image_index += 1
                try:
                    ocr_value = ocr_image_bytes(shape.image.blob)
                    if ocr_value:
                        text += ocr_value + "\n"; citations.append({"slide": index, "image": image_index, "text": ocr_value[:2000], "method": "ocr"})
                except Exception as error:
                    citations.append({"slide": index, "image": image_index, "ocr": "unavailable", "ocrError": str(error)})
    else: fail(f"Unsupported input format: {suffix}")
    return {"ok": True, "path": str(path), "text": text[:200000], "citations": citations}

try:
    request = json.loads(sys.stdin.read()); result = extract(request) if request.get("operation") == "extract" else generate(request)
    print(json.dumps(result), flush=True)
except Exception as error:
    fail(f"{type(error).__name__}: {error}")
