"""Dataset demo — casos del prompt maestro (REQUISITOS_CONTABLES §7)."""

from __future__ import annotations

import io
import json
from pathlib import Path

from openpyxl import Workbook
from sqlalchemy.orm import Session

from domain.enums import DocumentStatus
from infrastructure.persistence.models import DocumentModel, ProviderModel

DEMO_DIR = Path(__file__).resolve().parents[2] / "dataset" / "demo"

DEMO_CASES = {
    "correcto": {
        "descripcion": "Factura coincide con Autobits",
        "resultado_esperado": "APROBADO",
    },
    "diferencia_valor": {
        "descripcion": "Doc $850.000 vs Autobits $900.000",
        "resultado_esperado": "SUBSANACION",
    },
    "sin_proveedor": {
        "descripcion": "Extracción incompleta sin proveedor",
        "resultado_esperado": "SUBSANACION",
    },
    "compra_sin_reserva": {
        "descripcion": "Compra sin reserva vinculada",
        "resultado_esperado": "SUBSANACION",
    },
    "duplicado": {
        "descripcion": "Mismo NIT + número + total",
        "resultado_esperado": "DUPLICADO",
    },
    "ocr_debil": {
        "descripcion": "Pocos caracteres OCR",
        "resultado_esperado": "REQUIERE_REVISION",
    },
    "match_probable": {
        "descripcion": "Coincidencia parcial — revisión humana",
        "resultado_esperado": "EN_REVISION",
    },
}


def make_e2e_autobits_xlsx(
    *,
    proveedor: str = "E2E Hotel Demo SAS",
    nit: str = "900999888",
    compra: str = "E2E-C001",
    reserva: str = "E2E-R001",
    numero: str = "FE-E2E-001",
    valor: float = 850000.0,
) -> bytes:
    """Excel con columnas reales del export Autobits."""
    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "NIT/CC Proveedor (Orden de Compra)",
            "Nombre Proveedor (Orden de Compra)",
            "Codigo Orden de compra",
            "Codigo Reserva",
            "Fecha de ejecución (Reserva)",
            "estado de la compra",
            "Nombre concepto",
            "Moneda",
            "Total",
            "SI",
            "NO",
            "OBSERVACIONES",
        ]
    )
    ws.append(
        [
            nit,
            proveedor,
            compra,
            reserva,
            "2026-08-20",
            "Activa",
            "Hospedaje",
            "COP",
            valor,
            "",
            "",
            numero,
        ]
    )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def make_demo_autobits_xlsx() -> bytes:
    """Excel semanal con columnas reales Autobits."""
    wb = Workbook()
    ws = wb.active
    ws.title = "Autobits"
    ws.append(
        [
            "NIT/CC Proveedor (Orden de Compra)",
            "Nombre Proveedor (Orden de Compra)",
            "Codigo Orden de compra",
            "Codigo Reserva",
            "Fecha de ejecución (Reserva)",
            "estado de la compra",
            "Nombre concepto",
            "Moneda",
            "Total",
            "SI",
            "NO",
            "OBSERVACIONES",
        ]
    )
    rows = [
        ["900123456", "Hotel Andino SAS", "C-1001", "R-550", "2026-08-20", "Activa", "Hospedaje", "COP", 850000, "", "", "FE-7788"],
        ["900222333", "Hotel Pacífico LTDA", "C-2002", "R-660", "2026-08-21", "Activa", "Hospedaje", "COP", 900000, "", "", "FE-9900"],
        ["900333444", "Transporte Rápido SAS", "C-3003", "", "2026-08-22", "Activa", "Transporte", "COP", 500000, "", "", "FE-4400"],
        ["900444555", "Agencia Viajes Demo", "C-4004", "R-770", "2026-08-23", "Activa", "Servicios", "COP", 750000, "", "", "FE-5500"],
    ]
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def write_demo_xlsx_to_disk() -> Path:
    """Persiste el Excel demo en dataset/demo/ para uso manual."""
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    path = DEMO_DIR / "autobits_semana_demo.xlsx"
    path.write_bytes(make_demo_autobits_xlsx())
    return path


def seed_document(
    db: Session,
    *,
    proveedor: str | None = "Hotel Andino SAS",
    nit: str | None = "900123456",
    numero_documento: str = "FE-7788",
    total: float = 850000.0,
    compra: str | None = "C-1001",
    reserva: str | None = "R-550",
    estado: str = DocumentStatus.EXTRAIDO,
    filename: str | None = None,
) -> DocumentModel:
    provider = None
    if proveedor:
        provider = ProviderModel(nombre=proveedor, nit=nit or "")
        db.add(provider)

    extracted = {}
    if compra:
        extracted["compra"] = compra
    if reserva:
        extracted["reserva"] = reserva

    doc = DocumentModel(
        filename=filename or f"{numero_documento}.jpg",
        tipo="FACTURA",
        origen="CARGA_MANUAL",
        estado=estado,
        numero_documento=numero_documento,
        total=total,
        fecha_emision="2026-08-20",
        extracted_json=json.dumps(extracted) if extracted else None,
        provider=provider,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc
