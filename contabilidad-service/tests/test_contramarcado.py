"""Tests del contramarcado automático de facturas."""

from __future__ import annotations

import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.services.contramarcado import (
    STATUS_AMBIGUO,
    STATUS_GENERADO,
    STATUS_PENDIENTE,
    SOURCE_AUTOBITS,
    SOURCE_CROSSING,
    SOURCE_INVOICE,
    ComCandidate,
    build_contramarcado,
    format_fecha_ddmmyyyy,
    format_valor_tag,
    normalize_com,
    normalize_empresa,
    normalize_tipo_documento,
)


def test_formato_fecha_ddmmyyyy():
    assert format_fecha_ddmmyyyy("02/08/2026") == "02082026"
    assert format_fecha_ddmmyyyy("2026-08-02") == "02082026"
    assert format_fecha_ddmmyyyy("2-8-2026") == "02082026"


def test_valor_sin_separadores():
    assert format_valor_tag(21200) == "$21200"
    assert format_valor_tag("21.200") == "$21200"
    assert format_valor_tag("$21.200") == "$21200"
    assert format_valor_tag(21200.4) == "$21200"


def test_normalize_com_y_empresa():
    assert normalize_com("COM007244") == "COM007244"
    assert normalize_com("COM 007244") == "COM007244"
    assert normalize_empresa("FLYPASS S.A.S.") == "FLYPASS"
    assert normalize_tipo_documento("Factura electrónica") == "FE"


def test_com_en_factura():
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS",
        total=21200,
        extracted={"compra": "COM007244"},
    )
    assert result.status == STATUS_GENERADO
    assert result.source == SOURCE_INVOICE
    assert result.com == "COM007244"
    assert result.value == "02082026 FE FPFL-18121030 FLYPASS $21200 COM007244"


def test_ocr_com_no_pisa_autobits_distinto():
    """Si el OCR lee un COM que no está en Autobits, gana el Excel."""
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS",
        total=21200,
        extracted={},
        ocr_text="Referencia interna COM009999 sin relación con la OC",
        autobits_candidates=[
            ComCandidate(
                com="COM007244",
                source=SOURCE_AUTOBITS,
                score=90.0,
                reasons=["proveedor", "valor", "nit"],
                record_id=11,
            )
        ],
    )
    assert result.status == STATUS_GENERADO
    assert result.source == SOURCE_AUTOBITS
    assert result.com == "COM007244"
    assert result.record_id == 11


def test_com_factura_coincide_con_autobits():
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS",
        total=21200,
        extracted={"compra": "COM007244"},
        autobits_candidates=[
            ComCandidate(
                com="COM007244",
                source=SOURCE_AUTOBITS,
                score=95.0,
                reasons=["compra_exacta"],
                record_id=7,
            )
        ],
    )
    assert result.source == SOURCE_INVOICE
    assert result.com == "COM007244"


def test_candidato_crossing_bloquea_ocr():
    """Cruce Excel a score 100 debe ganar sobre un COM inventado en OCR."""
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FAC-1",
        proveedor="RESTAURANTE",
        total=17000,
        extracted={},
        ocr_text="texto basura COM009999",
        autobits_candidates=[
            ComCandidate(
                com="COM007441",
                source=SOURCE_CROSSING,
                score=100.0,
                reasons=["com_bloqueado_excel"],
                record_id=3,
            )
        ],
    )
    assert result.com == "COM007441"
    assert result.source == SOURCE_CROSSING


def test_com_en_ocr_texto():
    result = build_contramarcado(
        fecha_emision="2026-08-02",
        tipo_documento="Factura Electronica",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS SAS",
        total="21.200",
        extracted={},
        ocr_text="Orden de compra COM007244 asociada al peaje",
    )
    assert result.status == STATUS_GENERADO
    assert result.com == "COM007244"
    assert "COM007244" in result.value


def test_no_usa_numero_factura_como_com():
    """El COM del Excel gana; FE-/FPFL-/HIN nunca van al contramarcado."""
    result = build_contramarcado(
        fecha_emision="13/09/2026",
        tipo_documento="FE",
        numero_factura="FPFL-26895186",
        proveedor="F2X",
        total=21200,
        extracted={},
        autobits_candidates=[
            ComCandidate(com="FPFL-26895186", source=SOURCE_AUTOBITS, score=95.0, reasons=["documento_exacto"]),
            ComCandidate(com="COM007441", source=SOURCE_AUTOBITS, score=70.0, reasons=["proveedor", "valor"]),
        ],
    )
    assert result.com == "COM007441"
    assert result.value.endswith("COM007441")
    assert "FPFL-26895186" in result.value
    assert not result.value.endswith("FPFL-26895186")


def test_solo_factura_code_queda_pendiente():
    result = build_contramarcado(
        fecha_emision="12/09/2026",
        tipo_documento="FE",
        numero_factura="FE-6920",
        proveedor="JAVIER",
        total=84000,
        extracted={},
        autobits_candidates=[
            ComCandidate(com="FE-6920", source=SOURCE_AUTOBITS, score=90.0, reasons=["documento_exacto"]),
        ],
    )
    assert result.com is None
    assert result.value.endswith("COM pendiente")


def test_com_ausente_pendiente():
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS",
        total=21200,
        extracted={},
        autobits_candidates=[],
    )
    assert result.status == STATUS_PENDIENTE
    assert result.com is None
    assert result.value.endswith("COM pendiente")
    assert result.warning
    assert "COM" in result.warning


def test_multiples_coincidencias_ambiguo():
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS",
        total=21200,
        extracted={},
        autobits_candidates=[
            ComCandidate(com="COM007244", source=SOURCE_AUTOBITS, score=90.0, reasons=["proveedor", "valor"]),
            ComCandidate(com="COM007245", source=SOURCE_AUTOBITS, score=88.0, reasons=["proveedor", "valor"]),
        ],
    )
    assert result.status == STATUS_AMBIGUO
    assert result.com is None
    assert "COM pendiente" in result.value
    assert len(result.candidates) >= 2


def test_numero_con_guiones_se_conserva():
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS",
        total=21200,
        extracted={"compra": "COM007244"},
    )
    assert "FPFL-18121030" in result.value


def test_no_inventa_com():
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="X-1",
        proveedor="ACME",
        total=1000,
        extracted={"compra": "inventado-sin-digitos"},
    )
    assert result.com is None
    assert "COM pendiente" in result.value


def test_persist_fields():
    result = build_contramarcado(
        fecha_emision="02/08/2026",
        tipo_documento="FE",
        numero_factura="FPFL-18121030",
        proveedor="FLYPASS",
        total=21200,
        extracted={"compra": "COM007244"},
    )
    fields = result.persist_fields()
    assert fields["contramarcado"] == result.value
    assert fields["contramarcadoStatus"] == STATUS_GENERADO
    assert fields["contramarcadoCom"] == "COM007244"
    assert fields["contramarcadoSource"] == SOURCE_INVOICE
    assert fields["_contramarcado"]["value"] == result.value
