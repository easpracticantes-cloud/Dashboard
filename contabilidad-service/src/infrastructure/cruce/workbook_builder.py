"""Genera el Excel de salida con la estructura del estándar CRUCE DE CUENTAS."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
import os
import tempfile
from pathlib import Path

from openpyxl import Workbook, load_workbook
from openpyxl.cell.cell import MergedCell
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.worksheet import Worksheet

from domain.cruce.export_row import CruceExportRow
from domain.cruce.fields import fold, match_block_field
from infrastructure.cruce.xlsx_integrity import XlsxIntegrityError, validate_xlsx_bytes
from domain.cruce.workbook_spec import (
    BLOCK_GAP,
    BLOCK_WIDTH,
    BOSQUE_HEADERS,
    DUSTER_HEADERS,
    FONT_NAME,
    FONT_NAME_TABLE,
    GUIA_BLOCK_HEADERS,
    HEADER_FILL_BLUE,
    HEADER_FILL_PEACH,
    HEADER_FILL_TEAL,
    LUGER_HEADERS,
    PERIOD_BLOCK_HEADERS,
    PRECIO_EAS_FILL,
    PRECIO_TERC_FILL,
    PROVIDERS_PER_BAND,
    luger_sheet_name,
    period_sheets,
    standard_sheet_names,
)

_THIN = Border(
    left=Side(style="thin", color="B0B0B0"),
    right=Side(style="thin", color="B0B0B0"),
    top=Side(style="thin", color="B0B0B0"),
    bottom=Side(style="thin", color="B0B0B0"),
)
_HEADER_FONT = Font(name=FONT_NAME, size=11, bold=True, color="FFFFFF")
_TITLE_FONT = Font(name=FONT_NAME, size=12, bold=True)
_TABLE_HEADER_FONT = Font(name=FONT_NAME_TABLE, size=12, bold=True)
_MONEY_FMT = '#,##0'
_DATE_FMT = "YYYY-MM-DD"

MASTER_TEMPLATE_PATH = (
    Path(__file__).resolve().parent / "templates" / "CRUCE_DE_CUENTAS_MAESTRO.xlsx"
)
_STRUCTURAL_LABELS = {
    "total pagados",
    "total",
    "unidades disponibles año",
    "unidades disponibles año 2026",
    "ventas_duster",
    "cdc bosque de palmas",
    "precompra luger",
    "tour de cafe",
}
_HEADER_LABELS = {
    fold(header)
    for group in (
        PERIOD_BLOCK_HEADERS,
        GUIA_BLOCK_HEADERS,
        DUSTER_HEADERS,
        BOSQUE_HEADERS,
        LUGER_HEADERS,
    )
    for header in group
}
_CANONICAL_HEADERS = {
    fold(header): header
    for group in (
        PERIOD_BLOCK_HEADERS,
        GUIA_BLOCK_HEADERS,
        DUSTER_HEADERS,
        BOSQUE_HEADERS,
        LUGER_HEADERS,
    )
    for header in group
}


def _fill(rgb: str) -> PatternFill:
    return PatternFill("solid", fgColor=rgb)


def _as_date(value: str | None):
    if not value:
        return None
    text = str(value)[:10]
    try:
        return datetime.strptime(text, "%Y-%m-%d").date()
    except ValueError:
        return value


def _as_number(value: Decimal | None):
    if value is None:
        return None
    return float(value)


class CruceWorkbookBuilder:
    def __init__(self) -> None:
        self._from_template = False

    def build(self, rows: list[CruceExportRow], *, year: int | None = None) -> bytes:
        year = year or self._infer_year(rows)
        names = standard_sheet_names(year)
        self._from_template = MASTER_TEMPLATE_PATH.exists()
        if self._from_template:
            wb = load_workbook(MASTER_TEMPLATE_PATH, data_only=False)
            self._sanitize_template(wb)
            self._align_template_years(wb, year)
            self._clear_sample_values(wb)
            for name in names:
                if name not in wb.sheetnames:
                    wb.create_sheet(name)
        else:
            wb = Workbook()
            default = wb.active
            default.title = names[0]
            for name in names[1:]:
                wb.create_sheet(name)

        specials, period_rows = self._split(rows)
        self._write_period_sheets(wb, period_rows, year)
        self._write_duster(wb["VENTAS_DUSTER"], specials.get("duster", []))
        self._write_bosque(wb["CDC BOSQUE DE PALMAS"], specials.get("bosque", []))
        self._write_luger(wb[luger_sheet_name(year)], specials.get("luger", []))

        tmp_path = None
        try:
            fd, tmp_path = tempfile.mkstemp(prefix="Cruce_Cuentas_", suffix=".tmp.xlsx")
            os.close(fd)
            wb.save(tmp_path)
            wb.close()
            content = Path(tmp_path).read_bytes()
            validate_xlsx_bytes(content)
            return content
        except XlsxIntegrityError:
            raise
        finally:
            if tmp_path:
                Path(tmp_path).unlink(missing_ok=True)

    def _sanitize_template(self, wb) -> None:
        """Quita partes que openpyxl reescribe mal (comentarios/VML/hipervínculos/tablas).

        La plantilla real de Excel trae comentarios, drawings y cientos de
        hipervínculos a Drive. Al guardar, openpyxl deja `<legacyDrawing r:id="anysvml"/>`
        sin relationship: Microsoft Excel pide reparar el archivo.
        """
        for key in list(wb.defined_names):
            try:
                if "_FilterDatabase" in str(key):
                    del wb.defined_names[key]
            except Exception:
                continue
        for ws in wb.worksheets:
            ws._comments = []
            ws.legacy_drawing = None
            if hasattr(ws, "_hyperlinks"):
                ws._hyperlinks = []
            if hasattr(ws, "_images"):
                ws._images = []
            if hasattr(ws, "_charts"):
                ws._charts = []
            if hasattr(ws, "_drawing"):
                ws._drawing = None
            tables = getattr(ws, "tables", None)
            if tables:
                for table_name in list(tables):
                    del tables[table_name]
            if getattr(ws, "auto_filter", None) is not None:
                try:
                    ws.auto_filter.ref = None
                except Exception:
                    pass
            for row in ws.iter_rows():
                for cell in row:
                    if getattr(cell, "comment", None):
                        cell.comment = None
                    if getattr(cell, "hyperlink", None):
                        cell.hyperlink = None

    def _unmerge_overlapping(
        self, ws: Worksheet, min_row: int, min_col: int, max_row: int, max_col: int
    ) -> None:
        """Libera merges que taparían celdas de datos nuevos. No toca el archivo maestro."""
        for rng in list(ws.merged_cells.ranges):
            if (
                rng.max_row < min_row
                or rng.min_row > max_row
                or rng.max_col < min_col
                or rng.min_col > max_col
            ):
                continue
            ws.unmerge_cells(str(rng))

    def _set_cell(self, ws: Worksheet, row: int, col: int, value=None):
        cell = self._anchor_cell(ws, row, col)
        if value is not None:
            cell.value = value
        return cell

    def _anchor_cell(self, ws: Worksheet, row: int, col: int):
        """Escribe solo en el origen de un merge. Nunca en una MergedCell."""
        cell = ws.cell(row, col)
        if not isinstance(cell, MergedCell):
            return cell
        for rng in ws.merged_cells.ranges:
            if rng.min_row <= row <= rng.max_row and rng.min_col <= col <= rng.max_col:
                return ws.cell(rng.min_row, rng.min_col)
        return ws.cell(row, col)

    def _merge_block(
        self, ws: Worksheet, start_row: int, start_col: int, end_row: int, end_col: int
    ) -> None:
        if start_row == end_row and start_col == end_col:
            return
        for rng in list(ws.merged_cells.ranges):
            if (
                rng.min_row == start_row
                and rng.max_row == end_row
                and rng.min_col == start_col
                and rng.max_col == end_col
            ):
                return
        self._unmerge_overlapping(ws, start_row, start_col, end_row, end_col)
        ws.merge_cells(
            start_row=start_row,
            start_column=start_col,
            end_row=end_row,
            end_column=end_col,
        )

    def _align_template_years(self, wb, year: int) -> None:
        """Renombra hojas del maestro 2026 si el lote es de otro año. No altera el archivo original."""
        mapping = {
            "AÑO  2026 ENERO - ABRIL": f"AÑO  {year} ENERO - ABRIL",
            "PRECOMPRA LUGER 2026": luger_sheet_name(year),
        }
        for old, new in mapping.items():
            if old in wb.sheetnames and old != new:
                wb[old].title = new

    def _clear_sample_values(self, wb) -> None:
        """Quita datos históricos del maestro. Conserva estilos, anchos, merges y encabezados."""
        for name in wb.sheetnames:
            ws = wb[name]
            for row in ws.iter_rows(
                min_row=1,
                max_row=ws.max_row or 1,
                max_col=ws.max_column or 1,
            ):
                for cell in row:
                    if isinstance(cell, MergedCell) or cell.value is None:
                        continue
                    if self._is_structural_cell(cell.value):
                        self._canonicalize_header(cell)
                        continue
                    cell.value = None

    def _canonicalize_header(self, cell) -> None:
        if not isinstance(cell.value, str):
            return
        canon = _CANONICAL_HEADERS.get(fold(cell.value))
        if canon and cell.value != canon:
            cell.value = canon

    def _is_structural_cell(self, value) -> bool:
        if not isinstance(value, str):
            return False
        text = value.strip()
        if not text:
            return False
        if text.startswith("="):
            return True
        folded = fold(text)
        if folded in _HEADER_LABELS:
            return True
        if folded in _STRUCTURAL_LABELS or any(folded.startswith(label) for label in _STRUCTURAL_LABELS):
            return True
        return match_block_field(text) is not None

    def _infer_year(self, rows: list[CruceExportRow]) -> int:
        years = [r.year() for r in rows if r.year()]
        if years:
            return max(years)
        return date.today().year

    def _split(
        self, rows: list[CruceExportRow]
    ) -> tuple[dict[str, list[CruceExportRow]], list[CruceExportRow]]:
        specials: dict[str, list[CruceExportRow]] = defaultdict(list)
        period: list[CruceExportRow] = []
        for row in rows:
            token = row.special_sheet_token()
            if token:
                specials[token].append(row)
            else:
                period.append(row)
        return specials, period

    def _write_period_sheets(
        self, wb: Workbook, rows: list[CruceExportRow], year: int
    ) -> None:
        buckets: dict[str, list[CruceExportRow]] = {p.name: [] for p in period_sheets(year)}
        month_to_sheet = {}
        for sheet in period_sheets(year):
            for month in sheet.months:
                month_to_sheet[month] = sheet.name
        fallback = period_sheets(year)[0].name
        for row in rows:
            month = row.month()
            name = month_to_sheet.get(month, fallback)
            buckets[name].append(row)

        for sheet in period_sheets(year):
            ws = wb[sheet.name]
            grouped = self._group_by_provider(buckets[sheet.name])
            self._write_provider_bands(ws, grouped)

    def _group_by_provider(
        self, rows: list[CruceExportRow]
    ) -> list[tuple[str, list[CruceExportRow]]]:
        groups: dict[str, list[CruceExportRow]] = defaultdict(list)
        order: list[str] = []
        for row in rows:
            key = (row.proveedor or "").strip()
            if key not in groups:
                order.append(key)
            groups[key].append(row)
        for key in order:
            groups[key].sort(key=lambda r: (r.fecha_ejecucion or "", r.numero_compra or ""))
        return [(k, groups[k]) for k in order]

    def _write_provider_bands(
        self, ws: Worksheet, groups: list[tuple[str, list[CruceExportRow]]]
    ) -> None:
        if not groups:
            if not self._from_template:
                self._style_header_row(ws, 2, 1, PERIOD_BLOCK_HEADERS, HEADER_FILL_BLUE)
                self._autosize(ws, BLOCK_WIDTH)
            return

        start_row = 1
        for band_start in range(0, len(groups), PROVIDERS_PER_BAND):
            band = groups[band_start : band_start + PROVIDERS_PER_BAND]
            max_data = max(len(items) for _name, items in band)
            for idx, (proveedor, items) in enumerate(band):
                col0 = 1 + idx * (BLOCK_WIDTH + BLOCK_GAP)
                fill = HEADER_FILL_BLUE if idx % 2 == 0 else HEADER_FILL_PEACH
                title = proveedor if proveedor and proveedor != "(Sin proveedor)" else None
                nit = (items[0].nit or "").strip() if items else ""
                if title and nit:
                    title = f"{title}  {nit}"
                elif nit and not title:
                    title = nit
                title_cell = self._set_cell(ws, start_row, col0, title)
                title_cell.font = _TITLE_FONT
                if BLOCK_WIDTH > 1:
                    self._merge_block(
                        ws,
                        start_row,
                        col0,
                        start_row,
                        col0 + BLOCK_WIDTH - 1,
                    )
                self._style_header_row(
                    ws, start_row + 1, col0, PERIOD_BLOCK_HEADERS, fill
                )
                for offset, row in enumerate(items):
                    r = start_row + 2 + offset
                    values = [
                        _as_date(row.fecha_ejecucion),
                        row.numero_compra,
                        row.numero_reserva,
                        _as_number(row.valor),
                        row.factura_cdc,
                        _as_date(row.fecha_pago),
                    ]
                    for c, value in enumerate(values):
                        cell = self._set_cell(ws, r, col0 + c, value)
                        cell.border = _THIN
                        if c == 3 and value is not None:
                            cell.number_format = _MONEY_FMT
                        if c in (0, 5) and isinstance(value, date):
                            cell.number_format = _DATE_FMT
                # TOTAL PAGADOS del estándar: solo filas con FECHA DE PAGO.
                total_row = start_row + 2 + max_data
                valor_col = get_column_letter(col0 + 3)
                pago_col = get_column_letter(col0 + 5)
                first = start_row + 2
                last = start_row + 1 + max_data
                label = self._set_cell(ws, total_row, col0 + 2, "TOTAL PAGADOS")
                label.font = Font(name=FONT_NAME, bold=True)
                total_cell = self._set_cell(
                    ws,
                    total_row,
                    col0 + 3,
                    f'=SUMIF({pago_col}{first}:{pago_col}{last},"<>",{valor_col}{first}:{valor_col}{last})',
                )
                total_cell.number_format = _MONEY_FMT
                total_cell.font = Font(name=FONT_NAME, bold=True)
            start_row += max_data + 5

        last_col = PROVIDERS_PER_BAND * (BLOCK_WIDTH + BLOCK_GAP)
        if not self._from_template:
            self._autosize(ws, last_col)
        if not ws.freeze_panes:
            ws.freeze_panes = "A3"

    def _style_header_row(
        self, ws: Worksheet, row: int, col0: int, headers: tuple[str, ...], rgb: str
    ) -> None:
        fill = _fill(rgb)
        align = Alignment(horizontal="center", wrap_text=True, vertical="center")
        font = _HEADER_FONT if rgb != HEADER_FILL_PEACH else Font(
            name=FONT_NAME, size=11, bold=True
        )
        for i, header in enumerate(headers):
            cell = self._set_cell(ws, row, col0 + i, header)
            cell.fill = fill
            cell.font = font
            cell.alignment = align
            cell.border = _THIN

    def _write_duster(self, ws: Worksheet, rows: list[CruceExportRow]) -> None:
        if self._from_template and not rows:
            return
        self._merge_block(ws, 1, 2, 1, 10)
        title = self._set_cell(ws, 1, 2, "VENTAS_DUSTER")
        title.font = _TITLE_FONT
        self._write_table_headers(ws, 2, DUSTER_HEADERS, eas_col=9, terc_col=10)
        for i, row in enumerate(rows, start=3):
            values = [
                row.mes_nombre(),
                row.nit,
                row.numero_compra,
                row.referencia_oc,
                row.numero_reserva,
                _as_date(row.fecha_ejecucion),
                row.estado_compra,
                row.concepto,
                _as_number(row.valor),
                _as_number(row.precio_terceros),
            ]
            for c, value in enumerate(values, start=1):
                cell = self._set_cell(ws, i, c, value)
                cell.border = _THIN
                if c == 6 and isinstance(value, date):
                    cell.number_format = _DATE_FMT
                if c in (9, 10) and value is not None:
                    cell.number_format = _MONEY_FMT
        if rows:
            last = 2 + len(rows)
            total = self._set_cell(ws, last + 1, 9, f"=SUM(I3:I{last})")
            total.number_format = _MONEY_FMT
            total.font = Font(name=FONT_NAME_TABLE, bold=True)
            self._set_cell(ws, last + 1, 8, "TOTAL")
        if not ws.auto_filter.ref:
            ws.auto_filter.ref = f"A2:J{max(2, 2 + len(rows))}"
        elif rows:
            ws.auto_filter.ref = f"A2:J{max(2, 2 + len(rows))}"
        if not ws.freeze_panes:
            ws.freeze_panes = "A3"
        if not self._from_template:
            self._autosize(ws, 10)

    def _write_bosque(self, ws: Worksheet, rows: list[CruceExportRow]) -> None:
        if self._from_template and not rows:
            return
        title = self._set_cell(ws, 1, 2, "CDC BOSQUE DE PALMAS")
        title.font = _TITLE_FONT
        self._write_table_headers(ws, 9, BOSQUE_HEADERS)
        for i, row in enumerate(rows, start=10):
            values = [
                row.nit,
                row.proveedor,
                row.numero_compra,
                row.comprador,
                row.numero_reserva,
                row.vendedor,
                _as_date(row.fecha_ejecucion),
                row.estado_compra,
                _as_number(row.cantidad),
                _as_number(row.valor),
            ]
            for c, value in enumerate(values, start=1):
                cell = self._set_cell(ws, i, c, value)
                cell.border = _THIN
                if c == 7 and isinstance(value, date):
                    cell.number_format = _DATE_FMT
                if c in (9, 10) and value is not None:
                    cell.number_format = _MONEY_FMT
        if rows:
            last = 9 + len(rows)
            total = self._set_cell(ws, last + 1, 10, f"=SUM(J10:J{last})")
            total.number_format = _MONEY_FMT
            total.font = Font(name=FONT_NAME_TABLE, bold=True)
        if not ws.freeze_panes:
            ws.freeze_panes = "A10"
        if not self._from_template:
            self._autosize(ws, 10)

    def _write_luger(self, ws: Worksheet, rows: list[CruceExportRow]) -> None:
        if self._from_template and not rows:
            return
        title = self._set_cell(ws, 2, 2, "UNIDADES DISPONIBLES AÑO")
        title.font = _TITLE_FONT
        self._style_header_row(ws, 5, 2, LUGER_HEADERS, HEADER_FILL_TEAL)
        # INGRESO no existe en SIG: no se escribe la cadena EGRESO (depende de ese saldo).
        for i, row in enumerate(rows, start=6):
            fecha = self._set_cell(ws, i, 2, _as_date(row.fecha_ejecucion))
            fecha.number_format = _DATE_FMT
            self._set_cell(ws, i, 3, row.numero_compra)
            valor = self._set_cell(ws, i, 4, _as_number(row.valor))
            if row.valor is not None:
                valor.number_format = _MONEY_FMT
            # E4 INGRESO y F EGRESO se dejan vacíos: sin saldo de apertura en SIG.
        if not ws.freeze_panes:
            ws.freeze_panes = "B6"
        if not self._from_template:
            self._autosize(ws, 6)

    def _write_table_headers(
        self,
        ws: Worksheet,
        row: int,
        headers: tuple[str, ...],
        *,
        eas_col: int | None = None,
        terc_col: int | None = None,
    ) -> None:
        align = Alignment(horizontal="center", wrap_text=True)
        for i, header in enumerate(headers, start=1):
            cell = self._set_cell(ws, row, i, header)
            if eas_col and i == eas_col:
                cell.fill = _fill(PRECIO_EAS_FILL)
            elif terc_col and i == terc_col:
                cell.fill = _fill(PRECIO_TERC_FILL)
            else:
                cell.fill = _fill(HEADER_FILL_TEAL)
            cell.font = _TABLE_HEADER_FONT
            cell.alignment = align
            cell.border = _THIN

    def _autosize(self, ws: Worksheet, max_col: int) -> None:
        for col in range(1, max_col + 1):
            letter = get_column_letter(col)
            current = ws.column_dimensions[letter].width or 13
            ws.column_dimensions[letter].width = max(13, min(current, 36))
            if col == 8 and ws.title == "VENTAS_DUSTER":
                ws.column_dimensions[letter].width = 40
