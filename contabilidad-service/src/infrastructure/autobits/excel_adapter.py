"""Adaptador Excel para importación de reportes Autobits."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path
import re

from domain.autobits.fields import (
    AUTOBITS_EXPORT_COLUMNS,
    AUTOBITS_FIELDS,
    ParsedAutobitsRow,
    canonical_numero_compra,
    deterministic_mapping,
    looks_like_autobits_export,
    normalize_excel_nit,
    normalize_header,
    prefer_canonical_columns,
    suggest_mapping,
    value_from_row_dict,
)
from domain.matching.normalize import parse_date
from domain.utils.money import to_money_or_none
from openpyxl import load_workbook


class AutobitsImportError(Exception):
    def __init__(self, message: str, code: str = "IMPORT_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


@dataclass
class ExcelPreviewResult:
    columns: list[str]
    sample_rows: list[dict]
    suggested_mapping: dict[str, str | None]
    total_rows: int
    sheet_name: str


@dataclass
class ExcelParseResult:
    rows: list[ParsedAutobitsRow] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    skipped_empty: int = 0


def _to_float(value) -> float | None:
    """Importes COP: 1.234.567,89 / $14.300 / 14300.0."""
    if value is None or value == "":
        return None
    if isinstance(value, str) and not value.strip():
        return None
    parsed = to_money_or_none(value)
    if parsed is None:
        return None
    return float(parsed)


_MESES = {
    "ene": 1, "enero": 1, "jan": 1, "january": 1,
    "feb": 2, "febrero": 2, "february": 2,
    "mar": 3, "marzo": 3, "march": 3,
    "abr": 4, "abril": 4, "apr": 4, "april": 4,
    "may": 5, "mayo": 5,
    "jun": 6, "junio": 6, "june": 6,
    "jul": 7, "julio": 7, "july": 7,
    "ago": 8, "agosto": 8, "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "septiembre": 9, "set": 9, "setiembre": 9, "september": 9,
    "oct": 10, "octubre": 10, "october": 10,
    "nov": 11, "noviembre": 11, "november": 11,
    "dic": 12, "diciembre": 12, "dec": 12, "december": 12,
}


def _parse_spanish_date(texto: str) -> date | None:
    match = re.match(
        r"^(\d{1,2})[/\-\s.]+([a-záéíóúñ]{3,})[/\-\s.]+(\d{2,4})$",
        texto.strip(),
        re.IGNORECASE,
    )
    if not match:
        return None
    day = int(match.group(1))
    month = _MESES.get(match.group(2).lower())
    year = int(match.group(3))
    if year < 100:
        year += 2000
    if not month or not 1 <= day <= 31:
        return None
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _to_date_str(value) -> str | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        serial = float(value)
        if 20000 <= serial <= 80000:
            try:
                return (date(1899, 12, 30) + timedelta(days=int(round(serial)))).isoformat()
            except OverflowError:
                pass
        as_int = int(serial)
        if 19900101 <= as_int <= 21001231:
            parsed = parse_date(str(as_int))
            if parsed:
                return parsed.isoformat()
    parsed = parse_date(value)
    if parsed is not None:
        return parsed.isoformat()
    texto = str(value).strip()
    spanish = _parse_spanish_date(texto)
    if spanish:
        return spanish.isoformat()
    return texto[:10] if texto else None


def _to_str(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, float) and value == int(value) and abs(value) < 1e15:
        texto = str(int(value))
        return texto or None
    texto = str(value).strip()
    return texto or None


def _to_nit(value) -> str | None:
    return normalize_excel_nit(value)


def _read_workbook(path: Path):
    if path.suffix.lower() not in {".xlsx", ".xlsm", ".xltx", ".xltm"}:
        raise AutobitsImportError(
            "Formato no soportado. Use un archivo Excel (.xlsx).",
            "INVALID_FORMAT",
        )
    try:
        return load_workbook(path, read_only=True, data_only=True)
    except Exception as exc:
        raise AutobitsImportError(f"No se pudo leer el Excel: {exc}", "READ_ERROR") from exc


def _sheet_usefulness(columns: list[str], n_rows: int) -> int:
    """Puntúa si una hoja es el reporte Autobits (no portada)."""
    joined = " ".join(columns).lower()
    score = n_rows
    canon = {normalize_header(c) for c in AUTOBITS_EXPORT_COLUMNS}
    headers = {normalize_header(c) for c in columns if c}
    score += 40 * len(headers & canon)
    for hint in (
        "proveedor",
        "nit",
        "compra",
        "reserva",
        "total",
        "fecha",
        "concepto",
        "observacion",
        "orden",
        "factura",
    ):
        if hint in joined:
            score += 80
    return score


def _pick_best_sheet(wb):
    """Elige la hoja Autobits y, si hay varias iguales, junta las filas."""
    ranked: list[tuple[int, object, list[str], list]] = []
    for sheet in wb.worksheets:
        try:
            columns, data_rows = _iter_data_rows(sheet)
        except Exception:
            continue
        if not columns:
            continue
        ranked.append((_sheet_usefulness(columns, len(data_rows)), sheet, columns, data_rows))
    if not ranked:
        sheet = wb.active
        if sheet is None:
            raise AutobitsImportError("El archivo Excel no tiene hojas.", "EMPTY_WORKBOOK")
        columns, data_rows = _iter_data_rows(sheet)
        return sheet, columns, data_rows
    ranked.sort(key=lambda item: item[0], reverse=True)
    _best_score, sheet, columns, data_rows = ranked[0]
    best_norm = tuple(normalize_header(c) for c in columns)
    merged = list(data_rows)
    for score, _other, cols, rows in ranked[1:]:
        if score < 160:
            continue
        if tuple(normalize_header(c) for c in cols) != best_norm:
            continue
        merged.extend(rows)
    return sheet, columns, merged


def _normalize_mapping(mapping: dict[str, str | None], columns: list[str]) -> dict[str, str | None]:
    """Resuelve nombres de columna aunque la IA los devuelva con mayúsculas distintas."""
    exact = {c: c for c in columns}
    folded = {c.lower().strip(): c for c in columns}
    out: dict[str, str | None] = {}
    for field, col in (mapping or {}).items():
        if not col:
            out[field] = None
            continue
        if col in exact:
            out[field] = exact[col]
        elif col.lower().strip() in folded:
            out[field] = folded[col.lower().strip()]
        else:
            needle = col.lower().strip()
            match = next((c for c in columns if needle in c.lower() or c.lower() in needle), None)
            out[field] = match
    return out


def _iter_data_rows(sheet) -> tuple[list[str], list[tuple[int, dict]]]:
    """Lee filas; busca la fila de encabezados real (Autobits a veces pone título/copyright arriba)."""
    all_rows = list(sheet.iter_rows(values_only=True))
    if not all_rows:
        return [], []

    header_hints = (
        "proveedor",
        "nit",
        "orden",
        "compra",
        "reserva",
        "total",
        "observacion",
        "concepto",
        "fecha",
        "factura",
    )
    canon_headers = {normalize_header(c) for c in AUTOBITS_EXPORT_COLUMNS}

    def score_header(row) -> int:
        score = 0
        hits = 0
        for cell in row:
            if cell is None:
                continue
            t = str(cell).strip()
            if not t or t.lower().startswith("columna_"):
                continue
            nt = normalize_header(t)
            if nt in canon_headers:
                score += 10
                hits += 1
            elif any(h in nt for h in header_hints):
                score += 2
            elif not str(cell).replace(".", "").isdigit() and len(t) > 2:
                score += 1
        if hits >= 5:
            score += 40
        return score

    best_idx = 0
    best_score = -1
    scan_limit = min(len(all_rows), 40)
    for i, row in enumerate(all_rows[:scan_limit]):
        sc = score_header(row or ())
        if sc > best_score:
            best_score = sc
            best_idx = i

    # Si la "mejor" fila no parece encabezado, usar la primera
    if best_score < 4:
        best_idx = 0

    header_row = all_rows[best_idx]
    columns: list[str] = []
    for idx, cell in enumerate(header_row):
        label = _to_str(cell) or f"Columna_{idx + 1}"
        # Evitar copyright/título como nombre de columna
        low = label.lower()
        if "all rights reserved" in low or "autobits systems" in low:
            label = f"Columna_{idx + 1}"
        columns.append(label)

    # Desambiguar nombres duplicados
    seen: dict[str, int] = {}
    unique_cols: list[str] = []
    for col in columns:
        if col not in seen:
            seen[col] = 0
            unique_cols.append(col)
        else:
            seen[col] += 1
            unique_cols.append(f"{col}_{seen[col]}")
    columns = unique_cols

    data_rows: list[tuple[int, dict]] = []
    for offset, row in enumerate(all_rows[best_idx + 1 :], start=best_idx + 2):
        row_dict = {}
        has_value = False
        for col_name, cell in zip(columns, row or ()):
            if cell is not None and str(cell).strip() != "":
                has_value = True
            row_dict[col_name] = cell
        if has_value:
            data_rows.append((offset, row_dict))
    return columns, data_rows


class ExcelAutobitsAdapter:
    """Importador v1 de reportes semanales Autobits desde Excel."""

    def preview(self, path: Path, sample_limit: int = 5) -> ExcelPreviewResult:
        wb = _read_workbook(path)
        try:
            sheet, columns, data_rows = _pick_best_sheet(wb)
            if not columns:
                raise AutobitsImportError("El Excel está vacío o sin encabezados.", "EMPTY_SHEET")

            sample = []
            for _, row_dict in data_rows[:sample_limit]:
                sample.append({k: _serialize_cell(v) for k, v in row_dict.items()})

            return ExcelPreviewResult(
                columns=columns,
                sample_rows=sample,
                suggested_mapping=(
                    deterministic_mapping(columns)
                    if looks_like_autobits_export(columns)
                    else suggest_mapping(columns)
                ),
                total_rows=len(data_rows),
                sheet_name=sheet.title or "Sheet1",
            )
        finally:
            wb.close()

    def parse(
        self,
        path: Path,
        mapping: dict[str, str | None],
        *,
        validate: bool = True,
    ) -> ExcelParseResult:
        wb = _read_workbook(path)
        try:
            _sheet, columns, data_rows = _pick_best_sheet(wb)
            if not columns:
                raise AutobitsImportError("El Excel está vacío o sin encabezados.", "EMPTY_SHEET")

            mapping = _normalize_mapping(mapping, columns)
            mapping = prefer_canonical_columns(mapping, columns)
            active_mapping = {k: v for k, v in mapping.items() if v and v in columns}
            if validate and not active_mapping.get("valor") and not active_mapping.get("proveedor"):
                raise AutobitsImportError(
                    "Debe mapear al menos Proveedor o Valor.",
                    "INVALID_MAPPING",
                )

            result = ExcelParseResult()
            for excel_row, row_dict in data_rows:
                parsed = self._parse_row(excel_row, row_dict, active_mapping)
                if parsed.is_empty():
                    result.skipped_empty += 1
                    continue
                if parsed.errors:
                    result.errors.extend(parsed.errors)
                result.rows.append(parsed)
            return result
        finally:
            wb.close()

    def _parse_row(
        self,
        row_number: int,
        row_dict: dict,
        mapping: dict[str, str | None],
    ) -> ParsedAutobitsRow:
        errors: list[str] = []

        def get(field: str):
            col = mapping.get(field)
            if not col:
                return None
            return row_dict.get(col)

        valor = _to_float(get("valor"))
        if mapping.get("valor") and get("valor") not in (None, "") and valor is None:
            errors.append(f"Fila {row_number}: valor inválido")

        raw = {k: _serialize_cell(v) for k, v in row_dict.items()}
        observaciones = _to_str(get("observaciones"))
        estado_compra = _to_str(get("estado_compra"))
        if not observaciones:
            from domain.autobits.observaciones import extract_observaciones_from_raw

            observaciones = extract_observaciones_from_raw(raw)
        if not estado_compra:
            from domain.autobits.observaciones import extract_estado_compra_from_raw

            estado_compra = extract_estado_compra_from_raw(raw)

        # Si el mapeo IA apunta a una columna vacía/incorrecta, leer directo del Excel
        numero_compra = _to_str(
            value_from_row_dict(
                row_dict,
                "codigo orden de compra",
                "código orden de compra",
            )
        ) or _to_str(get("numero_compra"))
        numero_reserva = _to_str(get("numero_reserva")) or _to_str(
            value_from_row_dict(
                row_dict,
                "codigo reserva",
                "código reserva",
            )
        )
        numero_documento = _to_str(
            value_from_row_dict(
                row_dict,
                "codigo factura proveedor",
                "código factura proveedor",
                "codigo factura",
            )
        ) or _to_str(get("numero_documento"))
        proveedor = _to_str(
            value_from_row_dict(
                row_dict,
                "nombre proveedor (orden de compra)",
                "nombre proveedor",
            )
        ) or _to_str(get("proveedor"))
        nit = _to_nit(
            value_from_row_dict(
                row_dict,
                "nit/cc proveedor (orden de compra)",
                "nit/cc proveedor",
                "nit proveedor",
            )
        ) or _to_nit(get("nit"))
        fecha = _to_date_str(
            value_from_row_dict(
                row_dict,
                "fecha de ejecución (reserva)",
                "fecha de ejecucion (reserva)",
                "fecha de compra",
            )
        ) or _to_date_str(get("fecha"))
        if valor is None:
            raw_total = value_from_row_dict(row_dict, "total", "valor", "valor total")
            valor = _to_float(raw_total)

        parsed = ParsedAutobitsRow(
            row_number=row_number,
            proveedor=proveedor,
            nit=nit,
            numero_compra=numero_compra,
            numero_reserva=numero_reserva,
            numero_documento=numero_documento,
            valor=valor,
            fecha=fecha,
            concepto=_to_str(get("concepto")) or _to_str(
                value_from_row_dict(row_dict, "nombre concepto", "concepto")
            ),
            observaciones=observaciones,
            estado_compra=estado_compra,
            raw=raw,
            errors=errors or None,
        )
        parsed.numero_compra = canonical_numero_compra(parsed.numero_compra, raw)
        if parsed.proveedor and parsed.proveedor.strip().lower() in {"total", "totales", "suma"}:
            parsed.proveedor = None
            if not parsed.numero_compra and not parsed.numero_reserva and not parsed.numero_documento:
                parsed.valor = None
                parsed.nit = None
                parsed.fecha = None
                parsed.concepto = None
        return parsed

    def export_rows_csv(self, rows: list[dict]) -> str:
        """Genera CSV para actualización manual en Autobits."""
        headers = [
            "proveedor",
            "nit",
            "numero_compra",
            "numero_reserva",
            "numero_documento",
            "valor",
            "fecha",
            "concepto",
            "estado",
        ]
        lines = [",".join(headers)]
        for row in rows:
            values = []
            for key in headers:
                val = row.get(key, "")
                text = "" if val is None else str(val)
                if "," in text or '"' in text:
                    text = '"' + text.replace('"', '""') + '"'
                values.append(text)
            lines.append(",".join(values))
        return "\n".join(lines) + "\n"


def _serialize_cell(value):
    if isinstance(value, datetime):
        return value.isoformat(sep=" ", timespec="seconds")
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value == int(value) and abs(value) < 1e15:
        return int(value)
    return value


def mapping_to_json(mapping: dict[str, str | None]) -> str:
    return json.dumps({k: v for k, v in mapping.items() if k in AUTOBITS_FIELDS}, ensure_ascii=False)


def mapping_from_json(raw: str | None) -> dict[str, str | None]:
    if not raw:
        return {field: None for field in AUTOBITS_FIELDS}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return {field: None for field in AUTOBITS_FIELDS}
    return {field: data.get(field) for field in AUTOBITS_FIELDS}
