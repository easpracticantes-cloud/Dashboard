"""Compara estructura del Excel generado vs el estándar (sin copiar datos)."""
from __future__ import annotations

import sys
from decimal import Decimal
from pathlib import Path

from openpyxl import load_workbook

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from domain.cruce.export_row import CruceExportRow
from domain.cruce.workbook_spec import PERIOD_BLOCK_HEADERS, standard_sheet_names
from infrastructure.cruce.workbook_builder import CruceWorkbookBuilder

STANDARD = Path(r"C:\Users\07sam\Downloads\CRUCE DE CUENTAS 2026.xlsx")
OUT = ROOT / "dataset" / "demo" / "Cruce_Cuentas_validacion_estructura.xlsx"


def main() -> int:
    std = load_workbook(STANDARD, read_only=True, data_only=False)
    std_names = list(std.sheetnames)
    std.close()

    sample = [
        CruceExportRow(
            proveedor="RESTAURANTE DEMO",
            numero_compra="COM0001",
            numero_reserva="EAS0001",
            fecha_ejecucion="2026-02-10",
            valor=Decimal("89000"),
            factura_cdc="FV POS 1",
            fecha_pago="2026-02-15",
        ),
        CruceExportRow(
            proveedor="VENTAS DUSTER",
            nit="900000",
            numero_compra="COM0002",
            numero_reserva="EAS0002",
            fecha_ejecucion="2026-03-01",
            valor=Decimal("120000"),
            concepto="Servicio",
            estado_compra="Activa",
        ),
        CruceExportRow(
            proveedor="PARQUE NATURAL Y CULTURAL BOSQUE DE PALMAS SAS",
            nit="800000",
            numero_compra="COM0003",
            numero_reserva="EAS0003",
            fecha_ejecucion="2026-04-01",
            valor=Decimal("25000"),
        ),
        CruceExportRow(
            proveedor="PRECOMPRA LUGER",
            numero_compra="COM0004",
            fecha_ejecucion="2026-01-22",
            valor=Decimal("84000"),
        ),
    ]
    content = CruceWorkbookBuilder().build(sample, year=2026)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(content)

    gen = load_workbook(OUT)
    expected = list(standard_sheet_names(2026))
    print("ESTANDAR hojas:", std_names)
    print("GENERADO hojas:", gen.sheetnames)
    assert gen.sheetnames == expected, (gen.sheetnames, expected)
    # El estándar usa el mismo orden funcional; el nombre de la 1ª hoja incluye el año.
    assert len(std_names) == 6
    assert std_names[1] == "MAYO - JULIO"
    assert std_names[2] == "AGOSTO"
    assert std_names[3] == "VENTAS_DUSTER"
    assert std_names[4] == "CDC BOSQUE DE PALMAS"
    assert std_names[5].startswith("PRECOMPRA LUGER")

    enero = gen[expected[0]]
    headers = [enero.cell(2, c).value for c in range(1, 7)]
    assert tuple(headers) == PERIOD_BLOCK_HEADERS
    assert enero["B3"].value == "COM0001"
    assert enero["E3"].value == "FV POS 1"
    assert "SUMIF" in str(enero["D4"].value)
    gen.close()
    print("OK estructura equivalente. Archivo:", OUT)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
