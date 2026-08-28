"""Tests adapter OCR."""

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from infrastructure.ocr.tesseract_provider import TesseractOCRProvider


def test_ocr_provider_verify_returns_bool():
    provider = TesseractOCRProvider()
    result = provider.verify()
    assert isinstance(result, bool)
