"""Tests de casos demo — REQUISITOS_CONTABLES §7."""

import io
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

TESTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(TESTS_DIR.parent / "src"))
sys.path.insert(0, str(TESTS_DIR))

from config.settings import get_settings
from domain.enums import CrossingStatus, DocumentStatus, MatchType, RemediationType
from domain.matching.matching_engine import MatchingEngine
from domain.rules.rule_engine import RuleEngine
from domain.services.confidence_scorer import score_invoice_extraction
from domain.services.duplicate_detector import DuplicateDetector
from domain.matching.matching_engine import extract_document_context
from infrastructure.persistence.database import SessionLocal, init_db
from infrastructure.persistence.models import AutobitsRecordModel, DocumentModel, ProviderModel

from fixtures.demo_cases import DEMO_CASES, make_demo_autobits_xlsx, make_e2e_autobits_xlsx, seed_document, write_demo_xlsx_to_disk


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    from api_server import app

    return TestClient(app)


def _import_autobits(client: TestClient, xlsx: bytes | None = None) -> int:
    payload = xlsx or make_demo_autobits_xlsx()
    preview = client.post(
        "/api/autobits/preview",
        files={"archivo": ("demo.xlsx", payload, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert preview.status_code == 200
    data = preview.json()
    imp = client.post(
        "/api/autobits/import",
        data={
            "preview_id": data["preview_id"],
            "mapping_json": json.dumps(data["suggested_mapping"]),
            "period_start": "2026-08-16",
            "period_end": "2026-08-22",
        },
    )
    assert imp.status_code == 200
    body = imp.json()
    assert body["imported_rows"] >= 1 or body["skipped_duplicates"] >= 1
    return body["batch"]["id"]


def test_demo_dataset_file_on_disk():
    path = write_demo_xlsx_to_disk()
    assert path.exists()
    assert path.stat().st_size > 0
    assert len(DEMO_CASES) == 7


def test_demo_correcto_aprobado(client):
    db = SessionLocal()
    try:
        doc = seed_document(
            db,
            proveedor="Demo Correcto SAS",
            nit="900111000",
            numero_documento="FE-OK-001",
            compra="OK-C001",
            reserva="OK-R001",
            total=850000.0,
        )
        doc_id = doc.id
    finally:
        db.close()

    xlsx = make_e2e_autobits_xlsx(
        proveedor="Demo Correcto SAS",
        nit="900111000",
        compra="OK-C001",
        reserva="OK-R001",
        numero="FE-OK-001",
        valor=850000.0,
    )
    _import_autobits(client, xlsx)

    run = client.post("/api/crossings/run", json={"usuario": "ANDREA", "document_id": doc_id})
    assert run.status_code == 200

    items = client.get("/api/crossings").json()["items"]
    match = next(i for i in items if i["document_id"] == doc_id)
    assert match["estado"] == CrossingStatus.APROBADO
    assert match["match_type"] == MatchType.MATCH_EXACTO


def test_demo_diferencia_valor_subsanacion(client):
    db = SessionLocal()
    try:
        doc = seed_document(
            db,
            proveedor="Hotel Pacífico LTDA",
            nit="900222333",
            total=850000.0,
            numero_documento="FE-VAL-001",
            compra="VAL-C002",
            reserva="VAL-R660",
        )
        doc_id = doc.id
    finally:
        db.close()

    xlsx = make_e2e_autobits_xlsx(
        proveedor="Hotel Pacífico LTDA",
        nit="900222333",
        compra="VAL-C002",
        reserva="VAL-R660",
        numero="FE-VAL-001",
        valor=900000.0,
    )
    _import_autobits(client, xlsx)

    client.post("/api/crossings/run", json={"usuario": "ANDREA", "document_id": doc_id})
    items = client.get("/api/crossings").json()["items"]
    match = next(i for i in items if i["document_id"] == doc_id)
    assert match["estado"] == CrossingStatus.SUBSANACION

    rems = client.get("/api/remediations").json()["items"]
    tipos = {r["tipo_problema"] for r in rems if r.get("crossing_id") == match["id"]}
    assert RemediationType.DIFERENCIA_VALOR in tipos


def test_demo_sin_proveedor_subsanacion():
    db = SessionLocal()
    try:
        init_db()
        doc = DocumentModel(
            filename="sin-prov.jpg",
            tipo="FACTURA",
            origen="CARGA_MANUAL",
            estado=DocumentStatus.EXTRAIDO,
            numero_documento="FE-4400",
            total=500000.0,
            extracted_json='{"compra": "C-3003"}',
        )
        record = AutobitsRecordModel(
            id=1,
            import_batch_id=1,
            proveedor="Transporte Rápido SAS",
            nit="900333444",
            numero_compra="C-3003",
            numero_documento="FE-4400",
            valor=500000.0,
        )
        db.add(doc)
        db.commit()

        engine = MatchingEngine()
        rules = RuleEngine()
        candidate = engine.find_best_match(doc, [record])
        ctx = extract_document_context(doc)
        estado, rems, _ = rules.evaluate_crossing(ctx, candidate, record_nit=record.nit)
        assert RemediationType.SIN_PROVEEDOR in rems
        assert estado in (CrossingStatus.PENDIENTE, CrossingStatus.EN_REVISION, CrossingStatus.SUBSANACION)
    finally:
        db.close()


def test_demo_compra_sin_reserva_subsanacion():
    db = SessionLocal()
    try:
        init_db()
        provider = ProviderModel(nombre="Transporte Rápido SAS", nit="900333444")
        doc = DocumentModel(
            filename="sin-res.jpg",
            tipo="FACTURA",
            origen="CARGA_MANUAL",
            estado=DocumentStatus.EXTRAIDO,
            numero_documento="FE-4400",
            total=500000.0,
            extracted_json='{"compra": "C-3003"}',
            provider=provider,
        )
        record = AutobitsRecordModel(
            id=2,
            import_batch_id=1,
            proveedor="Transporte Rápido SAS",
            nit="900333444",
            numero_compra="C-3003",
            numero_reserva="",
            numero_documento="FE-4400",
            valor=500000.0,
        )
        db.add(provider)
        db.add(doc)
        db.commit()

        engine = MatchingEngine()
        rules = RuleEngine()
        candidate = engine.find_best_match(doc, [record])
        ctx = extract_document_context(doc)
        estado, rems, _ = rules.evaluate_crossing(ctx, candidate, record_nit=record.nit)
        assert RemediationType.COMPRA_SIN_RESERVA in rems
    finally:
        db.close()


def test_demo_duplicado_metadata():
    db = SessionLocal()
    try:
        init_db()
        provider = ProviderModel(nombre="Hotel Andino SAS", nit="900123456")
        doc1 = DocumentModel(
            filename="dup1.jpg",
            tipo="FACTURA",
            origen="CARGA_MANUAL",
            estado=DocumentStatus.EXTRAIDO,
            numero_documento="FE-DUP",
            total=850000.0,
            provider=provider,
        )
        db.add(provider)
        db.add(doc1)
        db.commit()

        detector = DuplicateDetector(db)
        result = detector.check_metadata("900123456", "FE-DUP", 850000.0)
        assert result.is_duplicate
        assert result.match_type == "METADATA"
    finally:
        db.close()


def test_demo_ocr_debil_requiere_revision():
    datos = {
        "numero_factura": "123",
        "proveedor": "Test SAS",
        "nit_o_identificacion": "900",
        "fecha_emision": "01/01/2024",
        "subtotal": "100",
        "impuesto": "19",
        "total": "119",
        "moneda": "COP",
    }
    result = score_invoice_extraction(datos, ocr_chars=12)
    assert result.requiere_revision is True
    assert result.global_score < 75


def test_demo_match_probable_en_revision(client):
    db = SessionLocal()
    try:
        doc = seed_document(
            db,
            proveedor="Agencia Viajes Demo",
            nit="900444555",
            numero_documento="OTRO-999",
            total=750000.0,
            compra="X-000",
            reserva="R-000",
        )
        doc_id = doc.id
    finally:
        db.close()

    xlsx = make_e2e_autobits_xlsx(
        proveedor="Agencia Viajes Demo",
        nit="900444555",
        compra="PROB-C004",
        reserva="PROB-R770",
        numero="FE-5500",
        valor=750000.0,
    )
    _import_autobits(client, xlsx)

    client.post("/api/crossings/run", json={"usuario": "ANDREA", "document_id": doc_id})
    items = client.get("/api/crossings").json()["items"]
    probable = next(i for i in items if i["document_id"] == doc_id)
    assert probable["match_type"] == MatchType.MATCH_PROBABLE
    assert probable["estado"] == CrossingStatus.EN_REVISION

    approve = client.post(
        f"/api/crossings/{probable['id']}/approve",
        json={"usuario": "ANDREA"},
    )
    assert approve.status_code == 200
    assert approve.json()["estado"] == CrossingStatus.APROBADO
