"""El XLSX de Cruce debe ser ZIP/XML válido y reabrirse sin reparación."""

import io
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings  # noqa: E402
from domain.cruce.export_row import CruceExportRow  # noqa: E402
from domain.enums import DocumentStatus  # noqa: E402
from infrastructure.cruce.workbook_builder import CruceWorkbookBuilder, MASTER_TEMPLATE_PATH  # noqa: E402
from infrastructure.cruce.xlsx_integrity import strip_ooxml_hazards, validate_xlsx_bytes  # noqa: E402
from infrastructure.persistence.database import SessionLocal, init_db  # noqa: E402
from infrastructure.persistence.models import DocumentModel, ProviderModel  # noqa: E402


def _vaciar():
    from infrastructure.persistence.database import engine
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        tablas = [
            row[0]
            for row in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))
            if not row[0].startswith("sqlite_")
        ]
        for tabla in tablas:
            conn.execute(text(f'DELETE FROM "{tabla}"'))


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    _vaciar()
    from api_server import app

    yield TestClient(app)
    _vaciar()


def test_strip_quita_comments_vml_aunque_openpyxl_los_reescriba(tmp_path):
    """El maestro + save() de openpyxl reproduce el XLSX de 25 partes del usuario."""
    from openpyxl import load_workbook

    dirty = tmp_path / "dirty.xlsx"
    wb = load_workbook(MASTER_TEMPLATE_PATH)
    wb.save(dirty)
    wb.close()
    raw = dirty.read_bytes()
    from zipfile import ZipFile

    with ZipFile(io.BytesIO(raw)) as zf:
        dirty_names = zf.namelist()
    assert any("comment" in n.lower() or n.endswith(".vml") for n in dirty_names)

    cleaned = strip_ooxml_hazards(raw)
    validate_xlsx_bytes(cleaned)
    with ZipFile(io.BytesIO(cleaned)) as zf:
        names = zf.namelist()
        xml = "".join(
            zf.read(n).decode("utf-8", "ignore")
            for n in names
            if n.endswith(".xml") or n.endswith(".rels")
        )
    assert not any("comment" in n.lower() or n.endswith(".vml") for n in names)
    assert "legacyDrawing" not in xml
    assert "vmlDrawing" not in xml
    assert "/xl/tables/table1.xml" not in xml
    assert "relationships/styles" in xml
    assert "relationships/theme" in xml
    with ZipFile(io.BytesIO(cleaned)) as zf:
        wbrels = zf.read("xl/_rels/workbook.xml.rels").decode("utf-8")
    assert 'Target="styles.xml"' in wbrels or 'Target="/xl/styles.xml"' in wbrels
    assert "theme/theme1.xml" in wbrels


def test_rel_target_styles_se_resuelve_desde_xl_no_desde_rels():
    from infrastructure.cruce.xlsx_integrity import _rel_target_exists

    names = {"xl/styles.xml", "xl/theme/theme1.xml", "xl/worksheets/sheet1.xml"}
    assert _rel_target_exists("xl/_rels/workbook.xml.rels", "styles.xml", names)
    assert _rel_target_exists("xl/_rels/workbook.xml.rels", "theme/theme1.xml", names)
    assert _rel_target_exists(
        "xl/_rels/workbook.xml.rels", "/xl/worksheets/sheet1.xml", names
    )


def test_maestro_no_se_modifica_al_generar():
    assert MASTER_TEMPLATE_PATH.exists()
    before = MASTER_TEMPLATE_PATH.read_bytes()
    CruceWorkbookBuilder().build(
        [
            CruceExportRow(
                proveedor="JORGE HERNANDO CASTAÑO GIRALDO",
                nit="70905826-6",
                numero_compra="FPOS-61226",
                factura_cdc="FPOS-61226",
                fecha_ejecucion="2026-08-04",
                valor=14300,
            )
        ],
        year=2026,
    )
    assert MASTER_TEMPLATE_PATH.read_bytes() == before


def test_builder_xlsx_zip_xml_roundtrip_sin_legacy_drawing_roto():
    content = CruceWorkbookBuilder().build(
        [
            CruceExportRow(
                proveedor="JORGE HERNANDO CASTAÑO GIRALDO",
                nit="70905826-6",
                numero_compra="FPOS-61226",
                factura_cdc="FPOS-61226",
                fecha_ejecucion="2026-08-04",
                valor=14300,
            )
        ],
        year=2026,
    )
    validate_xlsx_bytes(content)
    wb = load_workbook(io.BytesIO(content), data_only=False)
    agosto = wb["AGOSTO"]
    dumped = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            dumped.extend(str(v) for v in row if v is not None)
    text = " | ".join(dumped)
    assert "FPOS-61226" in text
    assert "JORGE HERNANDO CASTAÑO GIRALDO" in text
    assert "70905826-6" in text
    assert agosto["B3"].value == "FPOS-61226"
    assert agosto["D3"].value == 14300
    assert "COM005691" not in text
    assert "FV POS" not in text
    from zipfile import ZipFile
    import xml.etree.ElementTree as ET

    with ZipFile(io.BytesIO(content)) as zf:
        names = zf.namelist()
        assert not any(
            "comment" in n.lower()
            or n.endswith(".vml")
            or n.startswith("xl/persons/")
            or n.startswith("xl/drawings/")
            or n.startswith("xl/tables/")
            for n in names
        )
        for name in names:
            if name.endswith(".xml") or name.endswith(".rels"):
                raw = zf.read(name).decode("utf-8")
                assert "legacyDrawing" not in raw
                assert "vmlDrawing" not in raw
                assert "threadedComments" not in raw
                ET.fromstring(zf.read(name))


def test_export_endpoint_xlsx_integro_factura_sin_cruce(client):
    db = SessionLocal()
    try:
        provider = ProviderModel(nombre="JORGE HERNANDO CASTAÑO GIRALDO", nit="70905826-6")
        doc = DocumentModel(
            filename="fpos-61226.pdf",
            tipo="FACTURA",
            origen="CARGA_MANUAL",
            estado=DocumentStatus.CRUZANDO,
            numero_documento="FPOS-61226",
            fecha_emision="2026-08-04",
            total=14300,
            provider=provider,
        )
        db.add_all([provider, doc])
        db.commit()
        db.refresh(doc)
        doc_id = doc.id
    finally:
        db.close()

    res = client.get(f"/api/documents/export-excel?document_ids={doc_id}")
    assert res.status_code == 200, res.text
    assert res.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert res.content[:2] == b"PK"
    validate_xlsx_bytes(res.content)
    from zipfile import ZipFile

    with ZipFile(io.BytesIO(res.content)) as zf:
        blob = " ".join(zf.namelist()).lower()
        assert "comment" not in blob
        assert ".vml" not in blob
        assert "legacyDrawing" not in "".join(
            zf.read(n).decode("utf-8", "ignore")
            for n in zf.namelist()
            if n.endswith(".xml")
        )
    wb = load_workbook(io.BytesIO(res.content), data_only=False)
    dumped = " | ".join(
        str(v)
        for ws in wb.worksheets
        for row in ws.iter_rows(values_only=True)
        for v in row
        if v is not None
    )
    assert "FPOS-61226" in dumped
    assert "JORGE HERNANDO CASTAÑO GIRALDO" in dumped
    assert "70905826-6" in dumped


def test_export_vacio_sigue_siendo_xlsx_valido(client):
    res = client.get("/api/documents/export-excel")
    assert res.status_code == 200
    validate_xlsx_bytes(res.content)
