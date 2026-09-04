"""Convierte PDF a imagen PNG para OCR / visión."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def is_pdf(path: Path | str) -> bool:
    return Path(path).suffix.lower() == ".pdf"


def rasterize_pdf_first_page(path: Path | str, dest: Path | str, *, dpi: int = 200) -> Path | None:
    """Renderiza la primera página del PDF a PNG. Devuelve dest o None si falla."""
    src = Path(path)
    out = Path(dest)
    if not src.exists() or not is_pdf(src):
        return None
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF no instalado — no se puede rasterizar PDF")
        return None

    try:
        doc = fitz.open(src)
        if doc.page_count < 1:
            doc.close()
            return None
        page = doc.load_page(0)
        zoom = max(dpi, 72) / 72.0
        mat = fitz.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat, alpha=False)
        out.parent.mkdir(parents=True, exist_ok=True)
        pix.save(str(out))
        doc.close()
        return out if out.exists() else None
    except Exception as exc:
        logger.warning("Fallo rasterizando PDF %s: %s", src.name, exc)
        return None


def ensure_raster_image(path: Path | str, work_dir: Path | str | None = None) -> Path:
    """
    Si es PDF, genera PNG en work_dir (o junto al archivo).
    Si ya es imagen, devuelve el path original.
    """
    src = Path(path)
    if not is_pdf(src):
        return src
    base = Path(work_dir) if work_dir else src.parent
    dest = base / f"{src.stem}_page1.png"
    rendered = rasterize_pdf_first_page(src, dest)
    return rendered if rendered else src
