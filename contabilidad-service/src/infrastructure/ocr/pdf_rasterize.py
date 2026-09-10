"""Convierte PDF a imagen PNG para OCR / visión."""

from __future__ import annotations

import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def is_pdf(path: Path | str) -> bool:
    return Path(path).suffix.lower() == ".pdf"


def extract_pdf_native_text(path: Path | str, *, max_pages: int = 5) -> str:
    """Texto embebido del PDF (facturas DIAN / digitales). Vacío si es escaneo."""
    src = Path(path)
    if not src.exists() or not is_pdf(src):
        return ""
    try:
        import fitz  # PyMuPDF
    except ImportError:
        return ""
    try:
        doc = fitz.open(src)
        parts: list[str] = []
        for i, page in enumerate(doc):
            if i >= max_pages:
                break
            text = (page.get_text("text") or "").strip()
            if text:
                parts.append(text)
        doc.close()
        return "\n\n".join(parts).strip()
    except Exception as exc:
        logger.warning("No se pudo leer texto nativo de %s: %s", src.name, exc)
        return ""


def rasterize_pdf_first_page(path: Path | str, dest: Path | str, *, dpi: int = 300) -> Path | None:
    """Renderiza la primera página del PDF a PNG. Devuelve dest o None si falla."""
    pages = rasterize_pdf_pages(path, Path(dest).parent, dpi=dpi, max_pages=1)
    if not pages:
        return None
    dest_path = Path(dest)
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    if pages[0] != dest_path:
        dest_path.write_bytes(pages[0].read_bytes())
    return dest_path if dest_path.exists() else pages[0]


def rasterize_pdf_pages(
    path: Path | str,
    work_dir: Path | str,
    *,
    dpi: int = 300,
    max_pages: int = 3,
) -> list[Path]:
    """Renderiza hasta `max_pages` páginas a PNG."""
    src = Path(path)
    out_dir = Path(work_dir)
    if not src.exists() or not is_pdf(src):
        return []
    try:
        import fitz  # PyMuPDF
    except ImportError:
        logger.warning("PyMuPDF no instalado — no se puede rasterizar PDF")
        return []

    rendered: list[Path] = []
    try:
        doc = fitz.open(src)
        if doc.page_count < 1:
            doc.close()
            return []
        zoom = max(dpi, 72) / 72.0
        mat = fitz.Matrix(zoom, zoom)
        out_dir.mkdir(parents=True, exist_ok=True)
        for i in range(min(doc.page_count, max_pages)):
            page = doc.load_page(i)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            dest = out_dir / f"{src.stem}_page{i + 1}.png"
            pix.save(str(dest))
            if dest.exists():
                rendered.append(dest)
        doc.close()
        return rendered
    except Exception as exc:
        logger.warning("Fallo rasterizando PDF %s: %s", src.name, exc)
        return rendered


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
