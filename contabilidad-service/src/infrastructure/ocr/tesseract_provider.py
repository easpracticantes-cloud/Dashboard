"""Adapter OCR — envuelve Tesseract existente."""

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ocr import extraer_texto_con_fallback, verificar_tesseract
from preprocesamiento import preprocesar_imagen


@dataclass
class OCRResult:
    text: str
    method: str
    chars_original: int
    chars_preprocessed: int
    preprocessed_path: Path | None


class OCRProvider(Protocol):
    def verify(self) -> bool: ...
    def preprocess(self, source: Path, dest: Path) -> bool: ...
    def extract_with_fallback(self, original: Path, preprocessed: Path | None) -> OCRResult: ...


class TesseractOCRProvider:
    """Implementacion sobre ocr.py + preprocesamiento.py."""

    def verify(self) -> bool:
        return verificar_tesseract()

    def preprocess(self, source: Path, dest: Path) -> bool:
        return preprocesar_imagen(source, dest)

    def extract_with_fallback(self, original: Path, preprocessed: Path | None) -> OCRResult:
        texto, metodo, chars_o, chars_p = extraer_texto_con_fallback(original, preprocessed)
        return OCRResult(
            text=texto,
            method=metodo,
            chars_original=chars_o,
            chars_preprocessed=chars_p,
            preprocessed_path=preprocessed,
        )
