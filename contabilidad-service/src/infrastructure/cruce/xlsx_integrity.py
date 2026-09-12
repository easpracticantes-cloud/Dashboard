"""Validación de integridad de un XLSX (ZIP + XML + relaciones internas)."""

from __future__ import annotations

from io import BytesIO
from zipfile import ZipFile
import xml.etree.ElementTree as ET

from openpyxl import load_workbook

_REL_ID = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
_PKG_ID = "Id"


class XlsxIntegrityError(ValueError):
    """El workbook no es un XLSX válido para Microsoft Excel."""


def validate_xlsx_bytes(content: bytes) -> None:
    if not content or content[:2] != b"PK":
        raise XlsxIntegrityError("El archivo no es un ZIP/XLSX (falta firma PK).")
    with ZipFile(BytesIO(content)) as zf:
        broken = zf.testzip()
        if broken:
            raise XlsxIntegrityError(f"ZIP corrupto: {broken}")
        names = set(zf.namelist())
        required = {"[Content_Types].xml", "xl/workbook.xml"}
        missing = required - names
        if missing:
            raise XlsxIntegrityError(f"Faltan partes OOXML: {sorted(missing)}")
        for name in names:
            if name.endswith("/") or name.endswith((".bin", ".emf", ".png", ".jpeg", ".jpg")):
                continue
            if name.endswith(".xml") or name.endswith(".rels"):
                try:
                    ET.fromstring(zf.read(name))
                except ET.ParseError as exc:
                    raise XlsxIntegrityError(f"XML inválido en {name}: {exc}") from exc
        _assert_drawing_rels(zf, names)
        _assert_no_broken_comment_parts(names)

    wb = load_workbook(BytesIO(content), data_only=False)
    if not wb.sheetnames:
        raise XlsxIntegrityError("El workbook no tiene hojas.")
    buf = BytesIO()
    wb.save(buf)
    load_workbook(BytesIO(buf.getvalue()), data_only=False)


def _assert_drawing_rels(zf: ZipFile, names: set[str]) -> None:
    for name in names:
        if not name.startswith("xl/worksheets/sheet") or not name.endswith(".xml"):
            continue
        root = ET.fromstring(zf.read(name))
        rels_name = name.replace("xl/worksheets/", "xl/worksheets/_rels/") + ".rels"
        rel_ids: set[str] = set()
        if rels_name in names:
            rels = ET.fromstring(zf.read(rels_name))
            for rel in rels:
                rid = rel.attrib.get(_PKG_ID)
                if rid:
                    rel_ids.add(rid)
        for el in root.iter():
            tag = el.tag.split("}")[-1]
            if tag not in {"legacyDrawing", "drawing", "tablePart"}:
                continue
            rid = el.attrib.get(_REL_ID)
            if rid and rid not in rel_ids:
                raise XlsxIntegrityError(
                    f"{name} referencia {tag} r:id={rid!r} sin relationship "
                    f"(típico: legacyDrawing anysvml de comentarios rotos)."
                )


def _assert_no_broken_comment_parts(names: set[str]) -> None:
    """openpyxl reescribe comentarios/VML y deja r:id huérfanos. No los entregamos."""
    leftover = [
        name
        for name in names
        if "comments" in name.lower()
        or name.startswith("xl/drawings/vml")
        or name.startswith("xl/persons/")
        or name.endswith(".vml")
    ]
    if leftover:
        raise XlsxIntegrityError(
            "El XLSX aún contiene comentarios/VML/personas que Excel repara: "
            + ", ".join(sorted(leftover))
        )
