"""Routers API — dominio Autobits (Fase 3)."""

import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from application.services.autobits_service import AutobitsService, AutobitsServiceError
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/autobits", tags=["autobits"])


class FieldInfo(BaseModel):
    key: str
    label: str


class ImportResponse(BaseModel):
    batch: dict
    imported_rows: int
    skipped_duplicates: int
    skipped_empty: int
    parse_errors: list[str] = []
    detected_mapping: dict[str, str] | None = None
    sheet_name: str | None = None
    crossing: dict | None = None
    analysis_mode: str | None = None
    ai_notes: str | None = None


class PreviewResponse(BaseModel):
    preview_id: str
    filename: str
    columns: list[str]
    sample_rows: list[dict]
    suggested_mapping: dict[str, str | None]
    total_rows: int
    sheet_name: str
    fields: list[FieldInfo]
    analysis_mode: str | None = None
    ai_notes: str | None = None


class BatchListResponse(BaseModel):
    total: int
    items: list[dict]


class RecordListResponse(BaseModel):
    total: int
    items: list[dict]


class MarkReadyResponse(BaseModel):
    batch_id: int
    records_marked: int


@router.get("/fields")
def list_fields(db: Session = Depends(get_db)):
    """Catálogo de campos internos para mapeo."""
    service = AutobitsService(db)
    return {"fields": service.field_catalog()}


@router.post("/upload", response_model=ImportResponse)
async def upload_and_import(
    archivo: UploadFile = File(...),
    imported_by: str = Form("ANDREA"),
    auto_cruzar: bool = Form(True),
    db: Session = Depends(get_db),
):
    """Importa Excel: Ollama analiza la estructura y deduce campos automáticamente."""
    content = await archivo.read()
    service = AutobitsService(db)
    try:
        result = service.import_file_direct(
            content,
            archivo.filename or "autobits.xlsx",
            imported_by=imported_by,
            auto_cruzar=auto_cruzar,
        )
    except AutobitsServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return ImportResponse(**result)


@router.post("/preview", response_model=PreviewResponse)
async def preview_import(
    archivo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Legacy: vista previa con mapeo sugerido (opcional)."""
    content = await archivo.read()
    service = AutobitsService(db)
    try:
        data = service.preview_upload(content, archivo.filename or "autobits.xlsx")
    except AutobitsServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
    return PreviewResponse(**data)


@router.post("/import", response_model=ImportResponse)
def confirm_import(
    preview_id: str = Form(...),
    mapping_json: str = Form(...),
    period_start: str | None = Form(None),
    period_end: str | None = Form(None),
    imported_by: str = Form("ANDREA"),
    db: Session = Depends(get_db),
):
    """Legacy: confirma importación con mapeo manual."""
    try:
        mapping = json.loads(mapping_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="mapping_json inválido") from exc

    service = AutobitsService(db)
    try:
        result = service.confirm_import(
            preview_id,
            mapping,
            period_start=period_start or None,
            period_end=period_end or None,
            imported_by=imported_by,
        )
    except AutobitsServiceError as exc:
        status = 404 if exc.code == "PREVIEW_NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc
    return ImportResponse(**result)


@router.get("/batches/latest")
def get_latest_batch(db: Session = Depends(get_db)):
    """Último Excel Autobits importado (semana vigente para cruces)."""
    service = AutobitsService(db)
    batch = service.get_latest_batch()
    if not batch:
        raise HTTPException(status_code=404, detail="No hay importaciones Autobits.")
    return batch


@router.get("/batches", response_model=BatchListResponse)
def list_batches(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    """Lista lotes de importación Autobits."""
    service = AutobitsService(db)
    items, total = service.list_batches(limit=min(limit, 200), offset=offset)
    return BatchListResponse(total=total, items=items)


@router.get("/records", response_model=RecordListResponse)
def list_records(
    limit: int = 50,
    offset: int = 0,
    batch_id: int | None = None,
    search: str | None = None,
    estado: str | None = None,
    db: Session = Depends(get_db),
):
    """Lista registros importados de Autobits."""
    service = AutobitsService(db)
    items, total = service.list_records(
        limit=min(limit, 200),
        offset=offset,
        batch_id=batch_id,
        search=search,
        estado=estado,
    )
    return RecordListResponse(total=total, items=items)


@router.get("/records/{record_id}")
def get_record(record_id: int, db: Session = Depends(get_db)):
    """Detalle de un registro Autobits."""
    service = AutobitsService(db)
    data = service.get_record(record_id)
    if not data:
        raise HTTPException(status_code=404, detail="Registro no encontrado")
    return data


@router.post("/batches/{batch_id}/mark-ready", response_model=MarkReadyResponse)
def mark_batch_ready(batch_id: int, db: Session = Depends(get_db)):
    """Marca registros del lote como listos para actualizar Autobits manualmente."""
    service = AutobitsService(db)
    try:
        result = service.mark_batch_ready_for_update(batch_id)
    except AutobitsServiceError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc
    return MarkReadyResponse(**result)


@router.get("/batches/{batch_id}/export")
def export_batch(batch_id: int, db: Session = Depends(get_db)):
    """Exporta CSV para actualización manual en Autobits."""
    service = AutobitsService(db)
    try:
        csv_content = service.export_batch_csv(batch_id)
    except AutobitsServiceError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="autobits_lote_{batch_id}.csv"'},
    )
