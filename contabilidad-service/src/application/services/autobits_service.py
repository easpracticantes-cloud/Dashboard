"""Servicio de aplicación — importación Autobits."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from config.settings import get_settings
from domain.autobits.fields import (
    AUTOBITS_FIELDS,
    FIELD_LABELS,
    prefer_canonical_columns,
    suggest_mapping,
)
from domain.enums import AutobitsRecordStatus
from infrastructure.autobits.excel_adapter import (
    AutobitsImportError,
    ExcelAutobitsAdapter,
    mapping_from_json,
    mapping_to_json,
)
from infrastructure.ai.excel_ai_analyzer import ExcelAIAnalyzer, ExcelAIAnalyzerError
from infrastructure.persistence.models import AutobitsRecordModel, ImportBatchModel
from infrastructure.persistence.repositories import AuditRepository, AutobitsRepository

settings = get_settings()
STORAGE_ROOT = settings.storage_root / "autobits"
PREVIEW_DIR = STORAGE_ROOT / "previews"
IMPORT_DIR = STORAGE_ROOT / "imports"


class AutobitsServiceError(Exception):
    def __init__(self, message: str, code: str = "AUTOBITS_ERROR", status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code


def content_sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


class AutobitsService:
    def __init__(self, db: Session):
        self.db = db
        self.repo = AutobitsRepository(db)
        self.audit = AuditRepository(db)
        self.adapter = ExcelAutobitsAdapter()
        self.ai_analyzer = ExcelAIAnalyzer()

    def field_catalog(self) -> list[dict]:
        return [{"key": key, "label": FIELD_LABELS[key]} for key in AUTOBITS_FIELDS]

    def save_preview_file(self, content: bytes, filename: str) -> tuple[str, Path]:
        PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
        safe_name = Path(filename).name
        preview_id = uuid.uuid4().hex
        dest = PREVIEW_DIR / f"{preview_id}_{safe_name}"
        dest.write_bytes(content)
        return preview_id, dest

    def get_preview_path(self, preview_id: str) -> Path | None:
        if not preview_id or ".." in preview_id or "/" in preview_id or "\\" in preview_id:
            return None
        matches = list(PREVIEW_DIR.glob(f"{preview_id}_*"))
        return matches[0] if matches else None

    def preview_upload(self, content: bytes, filename: str) -> dict:
        preview_id, path = self.save_preview_file(content, filename)
        try:
            result = self.adapter.preview(path)
            analysis = self.ai_analyzer.analyze(
                result.columns,
                result.sample_rows,
                total_rows=result.total_rows,
                filename=filename,
                allow_fallback=True,
            )
        except (AutobitsImportError, ExcelAIAnalyzerError) as exc:
            path.unlink(missing_ok=True)
            raise AutobitsServiceError(exc.message, getattr(exc, "code", "AUTOBITS_ERROR")) from exc

        return {
            "preview_id": preview_id,
            "filename": Path(filename).name,
            "columns": result.columns,
            "sample_rows": result.sample_rows,
            "suggested_mapping": analysis.mapping,
            "total_rows": result.total_rows,
            "sheet_name": result.sheet_name,
            "fields": self.field_catalog(),
            "analysis_mode": analysis.mode,
            "ai_notes": analysis.sheet_notes,
        }

    def _detect_period_from_rows(self, rows) -> tuple[str | None, str | None]:
        """Infere período desde fechas del Excel; si no hay, usa semana contable actual."""
        from domain.utils.period_utils import week_bounds_saturday

        fechas: list[str] = []
        for row in rows:
            if getattr(row, "fecha", None):
                fechas.append(str(row.fecha)[:10])
        if fechas:
            fechas.sort()
            return fechas[0], fechas[-1]
        start, end = week_bounds_saturday()
        return start.isoformat(), end.isoformat()

    def import_file_direct(
        self,
        content: bytes,
        filename: str,
        *,
        imported_by: str = "SISTEMA",
        skip_duplicates: bool = True,
        auto_cruzar: bool = True,
        force: bool = False,
    ) -> dict:
        """Importa Excel: la IA analiza la estructura, deduce campos y luego importa."""
        if force:
            skip_duplicates = False
        if not content:
            raise AutobitsServiceError("El archivo llegó vacío.", "EMPTY_FILE")

        file_hash = content_sha256(content)
        if not force:
            existing = self.repo.find_batch_by_file_hash(file_hash)
            if existing:
                return self._result_from_existing_batch(
                    existing,
                    aviso=(
                        f"Este Excel ya estaba importado (lote #{existing.id}, "
                        f"{existing.filename}). Se muestran las filas existentes."
                    ),
                )

        preview_id, path = self.save_preview_file(content, filename)
        try:
            preview = self.adapter.preview(path)
            try:
                analysis = self.ai_analyzer.analyze(
                    preview.columns,
                    preview.sample_rows,
                    total_rows=preview.total_rows,
                    filename=filename,
                    allow_fallback=True,
                )
            except ExcelAIAnalyzerError as exc:
                path.unlink(missing_ok=True)
                raise AutobitsServiceError(exc.message, exc.code) from exc

            mapping = analysis.mapping
            # Forzar Codigo Reserva / Codigo Orden de compra del Excel Autobits real
            heuristic = suggest_mapping(preview.columns)
            for field in AUTOBITS_FIELDS:
                if not mapping.get(field) and heuristic.get(field):
                    mapping[field] = heuristic[field]
            mapping = prefer_canonical_columns(mapping, preview.columns)
            mapped = [v for v in mapping.values() if v]
            if not mapped:
                path.unlink(missing_ok=True)
                raise AutobitsServiceError(
                    "La IA no reconoció columnas útiles en el Excel. "
                    "Revise que el archivo tenga datos de proveedores/valores.",
                    "NO_MAPPING",
                )

            # El período se deduce de las fechas reales del archivo. La IA a veces
            # devuelve un rango mucho más amplio que los datos y eso desalinea el
            # cruce (que trabaja por semana contable).
            result = self.confirm_import(
                preview_id,
                mapping,
                imported_by=imported_by,
                skip_duplicates=skip_duplicates,
                file_hash=file_hash,
                force=force,
            )
            result["detected_mapping"] = {k: v for k, v in mapping.items() if v}
            result["sheet_name"] = preview.sheet_name
            result["analysis_mode"] = analysis.mode
            result["ai_notes"] = analysis.sheet_notes
            result["crossing"] = None

            if auto_cruzar and result["imported_rows"] > 0:
                try:
                    from application.services.crossing_service import CrossingService

                    crossing = CrossingService(self.db).seed_from_autobits(
                        batch_id=result["batch"]["id"],
                        usuario=imported_by,
                    )
                    result["crossing"] = crossing
                except Exception as exc:
                    result["crossing"] = {"created": 0, "error": str(exc)}

            return result
        except AutobitsServiceError:
            raise
        except Exception as exc:
            path.unlink(missing_ok=True)
            raise AutobitsServiceError(str(exc), "IMPORT_ERROR") from exc

    def confirm_import(
        self,
        preview_id: str,
        mapping: dict[str, str | None],
        *,
        period_start: str | None = None,
        period_end: str | None = None,
        imported_by: str = "SISTEMA",
        skip_duplicates: bool = True,
        file_hash: str | None = None,
        force: bool = False,
    ) -> dict:
        preview_path = self.get_preview_path(preview_id)
        if not preview_path or not preview_path.exists():
            raise AutobitsServiceError("La vista previa expiró o no existe.", "PREVIEW_NOT_FOUND")
        if force:
            skip_duplicates = False

        content = preview_path.read_bytes()
        resolved_hash = file_hash or content_sha256(content)
        if not force:
            existing = self.repo.find_batch_by_file_hash(resolved_hash)
            if existing:
                return self._result_from_existing_batch(
                    existing,
                    aviso=f"Este Excel ya estaba importado (lote #{existing.id}).",
                )

        try:
            parsed = self.adapter.parse(preview_path, mapping, validate=True)
        except AutobitsImportError as exc:
            raise AutobitsServiceError(exc.message, exc.code) from exc

        if not period_start or not period_end:
            auto_start, auto_end = self._detect_period_from_rows(parsed.rows)
            period_start = period_start or auto_start
            period_end = period_end or auto_end

        IMPORT_DIR.mkdir(parents=True, exist_ok=True)
        now = datetime.now()
        archive_name = preview_path.name.split("_", 1)[-1]
        archive_path = IMPORT_DIR / f"{now.year}" / f"{now.month:02d}" / f"{preview_id}_{archive_name}"
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        archive_path.write_bytes(content)

        batch = self.repo.create_batch(
            filename=archive_name,
            period_start=period_start,
            period_end=period_end,
            column_mapping_json=mapping_to_json(mapping),
            total_rows=len(parsed.rows) + parsed.skipped_empty,
            storage_path=str(archive_path),
            imported_by=imported_by,
            file_hash=resolved_hash,
        )

        imported = 0
        skipped_duplicates = 0
        row_errors = list(parsed.errors)

        for row in parsed.rows:
            if skip_duplicates:
                existing = self.repo.find_duplicate_record(
                    row.record_hash(),
                    period_start,
                    period_end,
                )
                if existing:
                    self.repo.update_record_from_parsed(existing, row, batch_id=batch.id)
                    skipped_duplicates += 1
                    continue
            self.repo.add_record(batch, row)
            imported += 1

        self.repo.finalize_batch_stats(
            batch,
            imported_rows=imported,
            skipped_rows=parsed.skipped_empty + skipped_duplicates,
            error_count=len(row_errors),
        )

        self.audit.log(
            "IMPORT_AUTOBITS",
            "ImportBatch",
            str(batch.id),
            valor_nuevo=f"{imported} filas importadas",
            usuario=imported_by,
        )
        self.db.commit()
        self.db.refresh(batch)

        # Recuperar reserva/COM aunque el mapeo previo haya fallado
        self.repair_records_from_raw(batch.id)
        if batch.storage_path:
            self.repair_records_from_storage(batch)

        preview_path.unlink(missing_ok=True)

        records = [self.to_record_dict(r) for r in self.repo.list_records_for_batch(batch.id)]
        visible = max(imported, len(records))
        return {
            "batch": self.to_batch_dict(batch),
            "imported_rows": visible,
            "skipped_duplicates": skipped_duplicates,
            "skipped_empty": parsed.skipped_empty,
            "parse_errors": row_errors[:20],
            "records": records[:200],
            "reused": False,
            "aviso": None,
        }

    def _result_from_existing_batch(self, batch: ImportBatchModel, *, aviso: str) -> dict:
        repaired = self.repair_records_from_raw(batch.id)
        if batch.storage_path:
            repaired += self.repair_records_from_storage(batch)
        if repaired:
            aviso = (
                f"{aviso} Se recuperaron códigos de reserva/COM "
                "desde el Excel original."
            )
        records = [self.to_record_dict(r) for r in self.repo.list_records_for_batch(batch.id)]
        mapping = mapping_from_json(batch.column_mapping_json)
        return {
            "batch": self.to_batch_dict(batch),
            "imported_rows": batch.imported_rows or len(records),
            "skipped_duplicates": 0,
            "skipped_empty": 0,
            "parse_errors": [],
            "records": records[:200],
            "reused": True,
            "aviso": aviso,
            "detected_mapping": {k: v for k, v in mapping.items() if v},
            "sheet_name": None,
            "analysis_mode": "reused",
            "ai_notes": aviso,
            "crossing": None,
        }

    @staticmethod
    def _value_from_raw(raw: dict, *needles: str) -> str | None:
        """Busca en raw_json por encabezado (p. ej. Codigo Reserva) aunque no se mapeó."""
        if not isinstance(raw, dict) or not raw:
            return None
        norms = [" ".join(n.strip().lower().split()) for n in needles if n]
        # 1) coincidencia exacta del encabezado
        for key, value in raw.items():
            if value is None or str(value).strip() == "":
                continue
            key_n = " ".join(str(key).strip().lower().split())
            if key_n in norms:
                return str(value).strip()
        # 2) el encabezado contiene el alias (solo alias largos, evita "com"→concepto)
        for needle in sorted(norms, key=len, reverse=True):
            if len(needle) < 5:
                continue
            for key, value in raw.items():
                if value is None or str(value).strip() == "":
                    continue
                key_n = " ".join(str(key).strip().lower().split())
                if needle in key_n:
                    return str(value).strip()
        return None

    def repair_records_from_raw(self, batch_id: int) -> int:
        """Alinea COM/reserva al Excel canónico en raw_json (nunca otras columnas)."""
        records = self.repo.list_records_for_batch(batch_id)
        fixed = 0
        for record in records:
            changed = False
            try:
                raw = json.loads(record.raw_json) if record.raw_json else {}
            except json.JSONDecodeError:
                raw = {}
            if not isinstance(raw, dict):
                continue
            reserva = self._value_from_raw(
                raw,
                "codigo reserva",
                "código reserva",
            )
            if reserva:
                text = str(reserva).strip()
                if text and (record.numero_reserva or "").strip() != text:
                    record.numero_reserva = text
                    changed = True
            compra = self._value_from_raw(
                raw,
                "codigo orden de compra",
                "código orden de compra",
            )
            from domain.autobits.fields import canonical_numero_compra, looks_like_invoice_code

            canon = canonical_numero_compra(compra or record.numero_compra, raw)
            current = (record.numero_compra or "").strip() or None
            if canon and current != canon:
                record.numero_compra = canon
                changed = True
            elif not canon and looks_like_invoice_code(current):
                record.numero_compra = None
                changed = True
            if changed:
                fixed += 1
        if fixed:
            self.db.commit()
        return fixed

    def repair_records_from_storage(self, batch: ImportBatchModel) -> int:
        """Relee el Excel guardado y completa reserva/COM faltantes fila a fila."""
        path = Path(batch.storage_path) if batch.storage_path else None
        if not path or not path.exists():
            return 0
        mapping = prefer_canonical_columns(
            mapping_from_json(batch.column_mapping_json),
            [],
        )
        try:
            preview = self.adapter.preview(path)
            mapping = prefer_canonical_columns(
                {**suggest_mapping(preview.columns), **{k: v for k, v in mapping.items() if v}},
                preview.columns,
            )
            parsed = self.adapter.parse(path, mapping, validate=False)
        except AutobitsImportError:
            return 0

        by_row = {p.row_number: p for p in parsed.rows}
        records = self.repo.list_records_for_batch(batch.id)
        fixed = 0
        for record in records:
            parsed_row = by_row.get(record.row_number)
            if not parsed_row:
                # Fallback por hash / orden si cambió la numeración
                continue
            changed = False
            if not (record.numero_reserva or "").strip() and parsed_row.numero_reserva:
                record.numero_reserva = parsed_row.numero_reserva
                changed = True
            if parsed_row.numero_compra and (record.numero_compra or "").strip() != parsed_row.numero_compra:
                record.numero_compra = parsed_row.numero_compra
                changed = True
            if parsed_row.raw and not record.raw_json:
                record.raw_json = json.dumps(parsed_row.raw, ensure_ascii=False)
                changed = True
            if changed:
                fixed += 1
        if fixed:
            # Actualizar mapeo persistido para próximas lecturas
            batch.column_mapping_json = mapping_to_json(mapping)
            self.db.commit()
        return fixed

    def list_batches(self, limit: int = 50, offset: int = 0) -> tuple[list[dict], int]:
        items, total = self.repo.list_batches(limit=limit, offset=offset)
        return [self.to_batch_dict(b) for b in items], total

    def get_latest_batch(self) -> dict | None:
        batch = self.repo.get_latest_batch()
        if not batch:
            return None
        return self.to_batch_dict(batch)

    def list_records(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        batch_id: int | None = None,
        search: str | None = None,
        estado: str | None = None,
    ) -> tuple[list[dict], int]:
        # Solo rellena COM/reserva VACÍOS desde raw canónico. Nunca re-parsea el Excel
        # con un mapeo nuevo (eso era lo que cambiaba los códigos al refrescar).
        if batch_id:
            self.repair_records_from_raw(batch_id)
        items, total = self.repo.list_records(
            limit=limit,
            offset=offset,
            batch_id=batch_id,
            search=search,
            estado=estado,
        )
        return [self.to_record_dict(r) for r in items], total

    def get_record(self, record_id: int) -> dict | None:
        record = self.repo.get_record(record_id)
        if not record:
            return None
        data = self.to_record_dict(record)
        data["purchases"] = [{"id": p.id, "numero": p.numero, "valor": p.valor, "fecha": p.fecha} for p in record.purchases]
        data["reservations"] = [
            {"id": r.id, "numero": r.numero, "valor": r.valor, "fecha": r.fecha} for r in record.reservations
        ]
        if record.raw_json:
            try:
                data["raw"] = json.loads(record.raw_json)
            except json.JSONDecodeError:
                data["raw"] = {}
        return data

    def mark_batch_ready_for_update(self, batch_id: int, usuario: str = "SISTEMA") -> dict:
        batch = self.repo.get_batch(batch_id)
        if not batch:
            raise AutobitsServiceError("Lote de importación no encontrado.", "NOT_FOUND")
        count = self.repo.mark_records_ready(batch_id)
        self.audit.log(
            "LISTO_PARA_AUTOBITS",
            "ImportBatch",
            str(batch_id),
            valor_nuevo=f"{count} registros",
            usuario=usuario,
        )
        self.db.commit()
        return {"batch_id": batch_id, "records_marked": count}

    def export_batch_csv(self, batch_id: int) -> str:
        batch = self.repo.get_batch(batch_id)
        if not batch:
            raise AutobitsServiceError("Lote de importación no encontrado.", "NOT_FOUND")

        records, _ = self.repo.list_records(batch_id=batch_id, limit=10000, offset=0)
        rows = []
        for record in records:
            if record.estado not in {
                AutobitsRecordStatus.IMPORTADO,
                AutobitsRecordStatus.LISTO_PARA_ACTUALIZAR,
            }:
                continue
            rows.append(self.to_record_dict(record))
        return self.adapter.export_rows_csv(rows)

    def to_batch_dict(self, batch: ImportBatchModel) -> dict:
        return {
            "id": batch.id,
            "filename": batch.filename,
            "period_start": batch.period_start,
            "period_end": batch.period_end,
            "total_rows": batch.total_rows,
            "imported_rows": batch.imported_rows,
            "skipped_rows": batch.skipped_rows,
            "error_count": batch.error_count,
            "status": batch.status,
            "file_hash": batch.file_hash,
            "imported_by": batch.imported_by,
            "imported_at": batch.imported_at.isoformat() if batch.imported_at else "",
            "column_mapping": mapping_from_json(batch.column_mapping_json),
        }

    def to_record_dict(self, record: AutobitsRecordModel) -> dict:
        from domain.autobits.fields import (
            canonical_numero_compra,
            com_from_excel_record,
            excel_compra_reserva,
            looks_like_invoice_code,
        )

        compra, reserva = excel_compra_reserva(record)
        com = com_from_excel_record(record) or canonical_numero_compra(
            record.numero_compra, getattr(record, "raw_json", None)
        )
        if not com and looks_like_invoice_code(compra):
            compra = None
        return {
            "id": record.id,
            "import_batch_id": record.import_batch_id,
            "row_number": record.row_number,
            "proveedor": record.proveedor,
            "nit": record.nit,
            "numero_compra": com or compra,
            "numero_reserva": reserva,
            "numero_documento": record.numero_documento,
            "valor": record.valor,
            "fecha": record.fecha,
            "concepto": record.concepto,
            "observaciones": record.observaciones,
            "estado_compra": record.estado_compra,
            "estado": record.estado,
            "created_at": record.created_at.isoformat() if record.created_at else "",
        }
