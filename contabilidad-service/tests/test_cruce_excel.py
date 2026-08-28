"""Excel de trabajo «CRUCE DE CUENTAS»: lectura, conciliación y pendientes."""

import io
import sys
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from config.settings import get_settings  # noqa: E402
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalysis  # noqa: E402
from infrastructure.persistence.database import init_db  # noqa: E402


def _fake_analysis():
    """Evita depender de Ollama en los tests."""
    return ExcelAIAnalysis(
        mapping={
            "proveedor": "Nombre Proveedor (Orden de Compra)",
            "nit": "NIT/CC Proveedor (Orden de Compra)",
            "numero_compra": "Codigo Orden de compra",
            "numero_reserva": "Codigo Reserva",
            "numero_documento": None,
            "valor": "Total",
            "fecha": "Fecha de ejecución (Reserva)",
            "concepto": "Nombre concepto",
            "observaciones": "OBSERVACIONES",
            "estado_compra": "estado de la compra",
        },
        period_start="2026-08-16",
        period_end="2026-08-22",
        mode="ia",
        sheet_notes="test",
    )


def _vaciar_tablas():
    """La base de tests es compartida; cada test parte de cero."""
    from infrastructure.persistence.database import engine
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text("PRAGMA foreign_keys = OFF"))
        tablas = [
            row[0]
            for row in conn.execute(
                text("SELECT name FROM sqlite_master WHERE type='table'")
            )
            if not row[0].startswith("sqlite_")
        ]
        for tabla in tablas:
            conn.execute(text(f'DELETE FROM "{tabla}"'))


@pytest.fixture
def client():
    get_settings.cache_clear()
    init_db()
    _vaciar_tablas()
    from api_server import app

    yield TestClient(app)
    # La deduplicación de Autobits es por hash+periodo: si dejáramos filas,
    # otros módulos de test verían sus cargas como duplicadas.
    _vaciar_tablas()


def _autobits_xlsx(filas: list[list]) -> bytes:
    """Export Autobits: encabezados reales y una fila por compra."""
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
    for nit, proveedor, compra, reserva, fecha, valor, obs in filas:
        ws.append(
            [nit, proveedor, compra, reserva, fecha, "Activa", "Servicio", "COP", valor, "", "", obs]
        )
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _cruce_xlsx(bloques: list[dict]) -> bytes:
    """Imita el Excel manual: nombre del proveedor arriba y su bloque debajo."""
    wb = Workbook()
    ws = wb.active
    ws.title = "AGOSTO"
    for bloque in bloques:
        ws.append([bloque["proveedor"]])
        ws.append(
            [
                "FECHA DE EJECUCIÓN",
                "ORDEN DE COMPRA",
                "REF.",
                "NOMBRE CONCEPTO",
                "VALOR",
                "FACTURA/CDC",
                "FECHA DE PAGO",
            ]
        )
        for fila in bloque["filas"]:
            ws.append(fila)
        ws.append([])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _subir_autobits(client, filas):
    with patch(
        "application.services.autobits_service.ExcelAIAnalyzer.analyze",
        return_value=_fake_analysis(),
    ):
        return client.post(
            "/api/autobits/upload",
            files={
                "archivo": (
                    "autobits.xlsx",
                    _autobits_xlsx(filas),
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
            },
            data={"auto_cruzar": "true"},
        )


def _subir_cruce(client, bloques, aplicar=True):
    return client.post(
        "/api/cruce-excel/upload",
        files={
            "archivo": (
                "CRUCE DE CUENTAS 2026.xlsx",
                _cruce_xlsx(bloques),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
        },
        data={"aplicar": "true" if aplicar else "false"},
    )


def test_cruce_requiere_autobits_primero(client):
    res = _subir_cruce(client, [{"proveedor": "Hotel Demo SAS", "filas": []}])
    assert res.status_code == 400
    assert "Autobits" in res.json()["detail"]


def test_cruce_llena_factura_y_fecha_de_pago(client):
    assert _subir_autobits(
        client,
        [
            ["900111", "Hotel Demo SAS", "COM001", "EAS001", "2026-08-20", 150000, ""],
            ["900222", "Transporte Demo", "COM002", "EAS002", "2026-08-21", 90000, ""],
        ],
    ).status_code == 200

    res = _subir_cruce(
        client,
        [
            {
                "proveedor": "Hotel Demo SAS",
                "filas": [
                    ["2026-08-20", "COM001", "EAS001", "Hospedaje", 150000, "FV POS 123", "2026-08-25"],
                ],
            },
            {
                "proveedor": "Transporte Demo",
                "filas": [
                    ["2026-08-21", "COM002", "EAS002", "Traslado", 90000, "CDC 55", None],
                ],
            },
        ],
    )
    assert res.status_code == 200, res.text
    data = res.json()

    assert data["lectura"]["filas_leidas"] == 2
    assert data["conciliacion"]["emparejadas"] == 2
    assert data["conciliacion"]["actualizadas"] == 2

    items = client.get("/api/crossings").json()["items"]
    por_compra = {i["numero_compra"]: i for i in items}

    assert por_compra["COM001"]["factura_cdc"] == "FV POS 123"
    assert por_compra["COM001"]["fecha_pago"] == "2026-08-25"
    assert por_compra["COM001"]["estado"] == "PAGADO"

    assert por_compra["COM002"]["factura_cdc"] == "CDC 55"
    assert not por_compra["COM002"]["fecha_pago"]
    assert por_compra["COM002"]["estado"] == "APROBADO"


def test_cruce_reporta_lo_que_falta_por_llenar(client):
    assert _subir_autobits(
        client,
        [
            ["900111", "Hotel Demo SAS", "COM001", "EAS001", "2026-08-20", 150000, ""],
            ["900333", "Restaurante Demo", "COM003", "EAS003", "2026-08-22", 70000, ""],
        ],
    ).status_code == 200

    # El Excel de cruce solo trae una de las dos filas, y sin fecha de pago.
    res = _subir_cruce(
        client,
        [
            {
                "proveedor": "Hotel Demo SAS",
                "filas": [
                    ["2026-08-20", "COM001", "EAS001", "Hospedaje", 150000, "FV POS 123", None],
                ],
            }
        ],
    )
    assert res.status_code == 200, res.text
    pendientes = res.json()["pendientes"]

    compras = lambda tipo: {  # noqa: E731
        i["numero_compra"] for i in pendientes["por_tipo"][tipo]
    }

    # COM003 no se digitó en el cruce
    assert "COM003" in compras("FALTA_EN_CRUCE")
    assert "COM001" not in compras("FALTA_EN_CRUCE")

    # COM001 quedó sin fecha de pago; COM003 sin nada
    assert "COM001" in compras("SIN_FECHA_PAGO")
    assert "COM003" in compras("SIN_FACTURA")

    # Ninguna tiene la factura del proveedor cargada
    assert compras("SIN_SOPORTE") == {"COM001", "COM003"}
    assert pendientes["total"] > 0


def test_cruce_detecta_filas_que_no_estan_en_autobits(client):
    assert _subir_autobits(
        client,
        [["900111", "Hotel Demo SAS", "COM001", "EAS001", "2026-08-20", 150000, ""]],
    ).status_code == 200

    res = _subir_cruce(
        client,
        [
            {
                "proveedor": "Proveedor Fantasma",
                "filas": [
                    ["2026-08-20", "COM999", "EAS999", "Otro", 500000, "FV 1", "2026-08-26"],
                ],
            }
        ],
    )
    assert res.status_code == 200, res.text
    data = res.json()
    assert data["conciliacion"]["sin_correspondencia"] == 1
    sobrantes = data["pendientes"]["por_tipo"]["SOBRA_EN_CRUCE"]
    assert sobrantes and sobrantes[0]["numero_compra"] == "COM999"


def test_cruce_solo_revisar_no_modifica(client):
    assert _subir_autobits(
        client,
        [["900111", "Hotel Demo SAS", "COM001", "EAS001", "2026-08-20", 150000, ""]],
    ).status_code == 200

    res = _subir_cruce(
        client,
        [
            {
                "proveedor": "Hotel Demo SAS",
                "filas": [
                    ["2026-08-20", "COM001", "EAS001", "Hospedaje", 150000, "FV POS 123", "2026-08-25"],
                ],
            }
        ],
        aplicar=False,
    )
    assert res.status_code == 200, res.text
    assert res.json()["aplicado"] is False
    assert res.json()["conciliacion"]["emparejadas"] == 1

    items = client.get("/api/crossings").json()["items"]
    fila = next(i for i in items if i["numero_compra"] == "COM001")
    assert not fila["factura_cdc"]


def test_cruce_detecta_conflicto_de_factura(client):
    assert _subir_autobits(
        client,
        [["900111", "Hotel Demo SAS", "COM001", "EAS001", "2026-08-20", 150000, ""]],
    ).status_code == 200

    items = client.get("/api/crossings").json()["items"]
    fila = next(i for i in items if i["numero_compra"] == "COM001")
    client.patch(
        f"/api/crossings/{fila['id']}/complete",
        json={"factura_cdc": "FV POS 111", "fecha_pago": ""},
    )

    res = _subir_cruce(
        client,
        [
            {
                "proveedor": "Hotel Demo SAS",
                "filas": [
                    ["2026-08-20", "COM001", "EAS001", "Hospedaje", 150000, "FV POS 999", None],
                ],
            }
        ],
    )
    assert res.status_code == 200, res.text
    conflictos = res.json()["conciliacion"]["conflictos"]
    assert len(conflictos) == 1
    assert conflictos[0]["campo"] == "factura_cdc"
    assert conflictos[0]["en_sistema"] == "FV POS 111"
    assert conflictos[0]["en_excel"] == "FV POS 999"


def test_pendientes_endpoint_sin_archivo(client):
    assert _subir_autobits(
        client,
        [["900111", "Hotel Demo SAS", "COM001", "EAS001", "2026-08-20", 150000, ""]],
    ).status_code == 200

    res = client.get("/api/cruce-excel/pendientes")
    assert res.status_code == 200
    data = res.json()
    assert data["has_autobits"] is True
    assert data["pendientes"]["total"] >= 2  # sin factura + sin fecha + sin soporte

    csv_res = client.get("/api/cruce-excel/pendientes/export")
    assert csv_res.status_code == 200
    assert "TIPO;PENDIENTE" in csv_res.text
