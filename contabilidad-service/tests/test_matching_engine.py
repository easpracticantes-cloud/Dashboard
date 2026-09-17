"""Tests del motor de matching."""

import sys
from pathlib import Path

import pytest

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.enums import MatchType
from domain.matching.matching_engine import MatchingEngine, extract_document_context
from infrastructure.persistence.models import AutobitsRecordModel, CruceRecordModel, DocumentModel, ProviderModel


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
        id=kwargs.get("id", 1),
        import_batch_id=1,
        proveedor=kwargs.get("proveedor", "Hotel Andino SAS"),
        nit=kwargs.get("nit", "900123456"),
        numero_compra=kwargs.get("numero_compra", "C-1001"),
        numero_reserva=kwargs.get("numero_reserva", "R-550"),
        numero_documento=kwargs.get("numero_documento", "FE-7788"),
        valor=kwargs.get("valor", 850000.0),
        fecha=kwargs.get("fecha", "2026-08-20"),
        raw_json=kwargs.get("raw_json"),
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


def test_match_factura_contra_cruce_no_autobits():
    engine = MatchingEngine()
    doc = _doc(numero_documento="CDC-99", extracted_json='{"compra": "C-1001", "reserva": "R-550"}')
    cruce = CruceRecordModel(
        id=7,
        import_batch_id=1,
        sheet="ENERO",
        row_number=12,
        proveedor="Hotel Andino SAS",
        nit="900123456",
        numero_compra="C-1001",
        numero_reserva="R-550",
        valor=850000.0,
        factura_cdc="CDC-99",
        fecha_ejecucion="2026-08-20",
    )
    candidate = engine.find_best_cruce_match(doc, [cruce])
    assert candidate is not None
    assert candidate.cruce_record_id == 7
    assert candidate.autobits_record_id == 0
    assert "factura_cdc" in candidate.reasons or "compra_exacta" in candidate.reasons


def test_match_invoice_number_from_excel_factura_uses_com():
    import json

    engine = MatchingEngine()
    doc = _doc(numero_documento="FE-6920", extracted_json="{}")
    record = _record(
        numero_compra="COM007441",
        numero_documento=None,
        raw_json=json.dumps(
            {
                "Codigo Orden de compra": "COM007441",
                "Codigo Factura proveedor": "FE-6920",
            }
        ),
    )
    candidate = engine.find_best_match(doc, [record])
    assert candidate is not None
    assert candidate.numero_compra == "COM007441"
    assert "documento_exacto" in candidate.reasons


def test_match_invoice_inside_ocr_blob_beats_same_provider_rows():
    """El n° de factura dentro del contramarcado debe ganar a otras filas del mismo proveedor."""
    import json

    engine = MatchingEngine()
    doc = _doc(
        numero_documento="12092026 FE-6920 JAVIER $84000",
        extracted_json="{}",
        proveedor="Hotel Andino SAS",
        nit="900123456",
        total=84000,
    )
    winner = _record(
        id=1,
        numero_compra="COM007441",
        numero_documento=None,
        proveedor="Hotel Andino SAS",
        nit="900123456",
        valor=999999,
        raw_json=json.dumps(
            {
                "Codigo Orden de compra": "COM007441",
                "Codigo Factura proveedor": "FE-6920",
            }
        ),
    )
    decoy = _record(
        id=2,
        numero_compra="COM000111",
        numero_documento=None,
        proveedor="Hotel Andino SAS",
        nit="900123456",
        valor=84000,
        raw_json=json.dumps(
            {
                "Codigo Orden de compra": "COM000111",
                "Codigo Factura proveedor": "FE-1111",
            }
        ),
    )
    candidate = engine.find_best_match(doc, [winner, decoy])
    assert candidate is not None
    assert candidate.autobits_record_id == 1
    assert candidate.numero_compra == "COM007441"
    assert "documento_exacto" in candidate.reasons
    assert "ambiguo" not in candidate.reasons


def test_match_sin_numero_factura_usa_nit_y_valor():
    """Excel sin Codigo Factura proveedor: cruza por NIT + valor y toma el COM."""
    import json

    engine = MatchingEngine()
    doc = _doc(
        numero_documento="FE-8888",
        extracted_json='{"nit_o_identificacion": "900123456-1"}',
        nit="900123456-1",
        total=14300,
        fecha_emision="2026-09-04",
    )
    record = _record(
        id=3,
        numero_compra="COM007441",
        numero_documento=None,
        nit="900123456",
        valor=14300,
        fecha="04/09/2026",
        raw_json=json.dumps({"Codigo Orden de compra": "COM007441", "NIT/CC Proveedor (Orden de Compra)": "900123456"}),
    )
    candidate = engine.find_best_match(doc, [record])
    assert candidate is not None
    assert candidate.numero_compra == "COM007441"
    assert "nit" in candidate.reasons
    assert "valor" in candidate.reasons


def test_assign_best_matches_same_nit_different_values():
    """Dos facturas del mismo NIT se quedan con el COM de su propio valor."""
    engine = MatchingEngine()
    a = _doc(numero_documento="A-1", total=10000, fecha_emision="2026-09-01")
    a.id = 10
    b = _doc(numero_documento="B-2", total=25000, fecha_emision="2026-09-02")
    b.id = 11
    ra = _record(id=1, numero_compra="COM000001", numero_documento=None, valor=10000, fecha="2026-09-01")
    rb = _record(id=2, numero_compra="COM000002", numero_documento=None, valor=25000, fecha="2026-09-02")
    assigned = engine.assign_best_matches([a, b], [ra, rb])
    assert assigned[10].numero_compra == "COM000001"
    assert assigned[11].numero_compra == "COM000002"


def test_nits_match_ignores_dv():
    from domain.matching.normalize import nits_match

    assert nits_match("900123456-1", "900123456")
    assert not nits_match("900123456", "800000000")
    """El n° de factura dentro del contramarcado debe ganar a otras filas del mismo proveedor."""
    import json

    engine = MatchingEngine()
    doc = _doc(
        numero_documento="12092026 FE-6920 JAVIER $84000",
        extracted_json="{}",
        proveedor="Hotel Andino SAS",
        nit="900123456",
        total=84000,
    )
    winner = _record(
        id=1,
        numero_compra="COM007441",
        numero_documento=None,
        proveedor="Hotel Andino SAS",
        nit="900123456",
        valor=999999,
        raw_json=json.dumps(
            {
                "Codigo Orden de compra": "COM007441",
                "Codigo Factura proveedor": "FE-6920",
            }
        ),
    )
    decoy = _record(
        id=2,
        numero_compra="COM000111",
        numero_documento=None,
        proveedor="Hotel Andino SAS",
        nit="900123456",
        valor=84000,
        raw_json=json.dumps(
            {
                "Codigo Orden de compra": "COM000111",
                "Codigo Factura proveedor": "FE-1111",
            }
        ),
    )
    candidate = engine.find_best_match(doc, [winner, decoy])
    assert candidate is not None
    assert candidate.autobits_record_id == 1
    assert candidate.numero_compra == "COM007441"
    assert "documento_exacto" in candidate.reasons
    assert "ambiguo" not in candidate.reasons
