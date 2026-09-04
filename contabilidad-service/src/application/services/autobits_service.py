"""Servicio de aplicación — importación Autobits."""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime
from pathlib import Path

from sqlalchemy.orm import Session

from config.settings import get_settings
from domain.autobits.fields import AUTOBITS_FIELDS, FIELD_LABELS
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
        if not content:
            raise AutobitsServiceError("El archivo llegó vacío.", "EMPTY_FILE")

        file_hash = content_sha256(content)
        if not force:
            existing = self.repo.find_batch_by_file_hash(file_hash)
            if existing:
                raise AutobitsServiceError(
                    f"Este Excel ya fue importado (lote #{existing.id}, "
                    f"{existing.filename}). No se permiten archivos repetidos. "
                    "Use force=true solo si necesita forzar una reimportación.",
                    "DUPLICATE_FILE",
                    status_code=409,
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

        content = preview_path.read_bytes()
        resolved_hash = file_hash or content_sha256(content)
        if not force:
            existing = self.repo.find_batch_by_file_hash(resolved_hash)
            if existing:
                raise AutobitsServiceError(
                    f"Este Excel ya fue importado (lote #{existing.id}).",
                    "DUPLICATE_FILE",
                    status_code=409,
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

        preview_path.unlink(missing_ok=True)

        return {
            "batch": self.to_batch_dict(batch),
            "imported_rows": imported,
            "skipped_duplicates": skipped_duplicates,
            "skipped_empty": parsed.skipped_empty,
            "parse_errors": row_errors[:20],
        }

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
        return {
            "id": record.id,
            "import_batch_id": record.import_batch_id,
            "row_number": record.row_number,
            "proveedor": record.proveedor,
            "nit": record.nit,
            "numero_compra": record.numero_compra,
            "numero_reserva": record.numero_reserva,
            "numero_documento": record.numero_documento,
            "valor": record.valor,
            "fecha": record.fecha,
            "concepto": record.concepto,
            "observaciones": record.observaciones,
            "estado_compra": record.estado_compra,
            "estado": record.estado,
            "created_at": record.created_at.isoformat() if record.created_at else "",
        }
