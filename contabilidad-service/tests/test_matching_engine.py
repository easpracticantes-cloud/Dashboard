"""Tests del motor de matching."""

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.enums import MatchType
from domain.matching.matching_engine import MatchingEngine, extract_document_context
from infrastructure.persistence.models import AutobitsRecordModel, DocumentModel, ProviderModel


def _doc(**kwargs) -> DocumentModel:
    provider = ProviderModel(nombre=kwargs.pop("proveedor", "Hotel Andino SAS"), nit=kwargs.pop("nit", "900123456"))
    doc = DocumentModel(
        filename="factura.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado="EXTRAIDO",
        numero_documento=kwargs.get("numero_documento", "FE-7788"),
        total=kwargs.get("total", 850000.0),
        fecha_emision=kwargs.get("fecha_emision", "2026-08-20"),
        extracted_json=kwargs.get(
            "extracted_json",
            '{"compra": "C-1001", "reserva": "R-550"}',
        ),
        provider=provider,
    )
    return doc


def _record(**kwargs) -> AutobitsRecordModel:
    return AutobitsRecordModel(
        id=1,
        import_batch_id=1,
        proveedor=kwargs.get("proveedor", "Hotel Andino SAS"),
        nit=kwargs.get("nit", "900123456"),
        numero_compra=kwargs.get("numero_compra", "C-1001"),
        numero_reserva=kwargs.get("numero_reserva", "R-550"),
        numero_documento=kwargs.get("numero_documento", "FE-7788"),
        valor=kwargs.get("valor", 850000.0),
        fecha=kwargs.get("fecha", "2026-08-20"),
    )


def test_match_exacto():
    engine = MatchingEngine()
    doc = _doc()
    record = _record()
    candidate = engine.find_best_match(doc, [record])
    assert candidate is not None
    assert candidate.match_type == MatchType.MATCH_EXACTO
    assert candidate.score >= 85


def test_match_probable_por_nit_y_valor():
    engine = MatchingEngine()
    doc = _doc(numero_documento="OTRO-999")
    record = _record(numero_documento="FE-0001", numero_compra="X-9")
    candidate = engine.find_best_match(doc, [record])
    assert candidate is not None
    assert candidate.match_type in (MatchType.MATCH_PROBABLE, MatchType.MATCH_EXACTO)


def test_sin_match():
    engine = MatchingEngine()
    doc = _doc(
        proveedor="Empresa A",
        nit="111",
        total=1000,
        numero_documento="DOC-A",
        extracted_json='{"compra": "CMP-A", "reserva": "RES-A"}',
    )
    doc.provider.nombre = "Empresa A"
    doc.provider.nit = "111"
    record = _record(
        proveedor="Empresa B",
        nit="222",
        valor=999999,
        numero_compra="ZZZ",
        numero_reserva="RES-Z",
        numero_documento="DOC-B",
    )
    candidate = engine.find_best_match(doc, [record])
    assert candidate is None


def test_extract_document_context():
    doc = _doc()
    ctx = extract_document_context(doc)
    assert ctx.compra == "C-1001"
    assert ctx.reserva == "R-550"
    assert ctx.valor == 850000.0
