"""Parser del Excel de cruce sin FastAPI."""

import io
import sys
from pathlib import Path

from openpyxl import Workbook

SRC = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC))

from domain.cruce.fields import match_block_field  # noqa: E402
from infrastructure.cruce.excel_adapter import CruceExcelAdapter  # noqa: E402

REAL_CRUCE = Path(r"c:\Users\07sam\Downloads\CRUCE DE CUENTAS 2026.xlsx")


def test_nit_con_orden_de_compra_no_es_compra():
    assert match_block_field("NIT/CC Proveedor (Orden de Compra)") == "nit"
    assert match_block_field("Codigo Orden de compra") == "compra"
    assert match_block_field("Codigo Reserva") == "reserva"
    assert match_block_field("PRECIO EAS") == "valor"
    assert match_block_field("PRECIO TERCEROS") is None
    assert match_block_field("TOTAL PAGADOS") is None


def test_parse_tabla_duster_en_memoria():
    wb = Workbook()
    ws = wb.active
    ws.title = "VENTAS_DUSTER"
    ws.append(
        [
            "MES",
            "NIT/CC Proveedor (Orden de Compra)",
            "Codigo Orden de compra",
            "Referencia (Orden de Compra)",
            "Codigo Reserva",
            "Fecha de ejecución (Reserva)",
            "PRECIO EAS",
            "PRECIO TERCEROS",
        ]
    )
    ws.append(["AGOSTO", "901814243", "COM007551", "Civitatis_x", "EAS002999", "2026-08-20", 308000, 380000])
    buf = io.BytesIO()
    wb.save(buf)
    tmp = Path(__file__).resolve().parent / "_tmp_duster.xlsx"
    tmp.write_bytes(buf.getvalue())
    try:
        parsed = CruceExcelAdapter().parse(tmp)
        assert len(parsed.rows) == 1
        row = parsed.rows[0]
        assert row.numero_compra == "COM007551"
        assert row.numero_reserva == "EAS002999"
        assert row.valor == 308000
        assert row.nit == "901814243"
    finally:
        tmp.unlink(missing_ok=True)


def test_parse_cruce_cuentas_2026_real():
    if not REAL_CRUCE.exists():
        return
    parsed = CruceExcelAdapter().parse(REAL_CRUCE)
    duster = [r for r in parsed.rows if "DUSTER" in r.sheet.upper()]
    bosque = [r for r in parsed.rows if "BOSQUE" in r.sheet.upper()]
    agosto = [r for r in parsed.rows if r.sheet == "AGOSTO"]
    assert duster
    assert any((r.numero_compra or "").startswith("COM") for r in duster)
    assert not any((r.numero_compra or "").isdigit() and len(r.numero_compra or "") >= 9 for r in duster[:8])
    assert bosque and any((r.numero_compra or "").startswith("COM") for r in bosque)
    assert any(r.numero_compra == "COM007246" and r.factura_cdc == "FPOS-16488" for r in agosto)
