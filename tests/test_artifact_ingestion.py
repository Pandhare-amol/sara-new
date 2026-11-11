import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from docx import Document
from docx.shared import Inches
from openpyxl import Workbook
from openpyxl.drawing.image import Image as SheetImage
from pptx import Presentation
from pptx.util import Inches as SlideInches
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "scripts" / "artifact_worker.py"


class ArtifactIngestionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        configured = os.environ.get("TESSERACT_PATH")
        candidates = [configured, r"C:\Program Files\Tesseract-OCR\tesseract.exe", r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe"]
        cls.ocr_available = any(p and Path(p).exists() for p in candidates) or bool(__import__("shutil").which("tesseract"))

    def run_extract(self, artifact):
        request = json.dumps({"operation": "extract", "path": str(artifact)})
        result = subprocess.run([sys.executable, str(WORKER)], input=request, text=True, capture_output=True, check=True, timeout=60)
        return json.loads(result.stdout)

    def run_generate(self, artifact, fmt, content):
        request = json.dumps({"operation": "generate", "format": fmt, "path": str(artifact), "title": "Sara validation report", "content": content})
        result = subprocess.run([sys.executable, str(WORKER)], input=request, text=True, capture_output=True, check=True, timeout=60)
        return json.loads(result.stdout)

    def test_real_office_and_pdf_generation_reopens_with_expected_content(self):
        with tempfile.TemporaryDirectory(prefix="sara-generated-artifacts-") as temp:
            root = Path(temp); body = "Verified content created by the Sara artifact worker."
            for fmt, extension in (("pdf", ".pdf"), ("docx", ".docx"), ("xlsx", ".xlsx"), ("pptx", ".pptx")):
                artifact = root / f"report{extension}"
                generated = self.run_generate(artifact, fmt, body)
                self.assertTrue(generated["ok"])
                extracted = self.run_extract(artifact)
                self.assertIn(body, extracted["text"])
                self.assertTrue(extracted["citations"])

    def test_embedded_images_are_ocrd_with_document_locations(self):
        if not self.ocr_available:
            self.skipTest("Tesseract is not installed")
        with tempfile.TemporaryDirectory(prefix="sara-artifact-test-") as temp:
            root = Path(temp)
            image_path = root / "label.png"
            image = Image.new("RGB", (1200, 220), "white")
            font = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 64)
            ImageDraw.Draw(image).text((35, 45), "SARA OCR CHECK 8742", fill="black", font=font)
            image.save(image_path)

            docx_path = root / "embedded.docx"
            doc = Document(); doc.add_paragraph("Image test"); doc.add_picture(str(image_path), width=Inches(5)); doc.save(docx_path)
            docx = self.run_extract(docx_path)
            self.assertIn("SARA OCR CHECK 8742", docx["text"])
            self.assertTrue(any(item.get("method") == "ocr" and "document image" in item.get("location", "") for item in docx["citations"]))

            xlsx_path = root / "embedded.xlsx"
            workbook = Workbook(); sheet = workbook.active; sheet.title = "Metrics"; sheet.add_image(SheetImage(str(image_path)), "B3"); workbook.save(xlsx_path)
            xlsx = self.run_extract(xlsx_path)
            self.assertIn("SARA OCR CHECK 8742", xlsx["text"])
            self.assertTrue(any(item.get("method") == "ocr" and item.get("sheet") == "Metrics" for item in xlsx["citations"]))

            pptx_path = root / "embedded.pptx"
            presentation = Presentation(); slide = presentation.slides.add_slide(presentation.slide_layouts[6]); slide.shapes.add_picture(str(image_path), SlideInches(1), SlideInches(1)); presentation.save(pptx_path)
            pptx = self.run_extract(pptx_path)
            self.assertIn("SARA OCR CHECK 8742", pptx["text"])
            self.assertTrue(any(item.get("method") == "ocr" and item.get("slide") == 1 for item in pptx["citations"]))

            pdf_path = root / "mixed.pdf"
            pdf = canvas.Canvas(str(pdf_path), pagesize=letter); pdf.drawString(60, 740, "Selectable PDF heading")
            pdf.drawImage(str(image_path), 60, 500, width=480, height=88); pdf.save()
            pdf_result = self.run_extract(pdf_path)
            self.assertIn("Selectable PDF heading", pdf_result["text"])
            self.assertIn("SARA OCR CHECK 8742", pdf_result["text"])
            self.assertTrue(any(item.get("page") == 1 and item.get("method") == "text+ocr" for item in pdf_result["citations"]))


if __name__ == "__main__":
    unittest.main()
