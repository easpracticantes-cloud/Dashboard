"""Routers API — dominio documentos (Fase 2)."""

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
)
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from api.deps import resolve_usuario
from application.services.document_processing_service import get_document_processing_service
from application.services.document_service import DocumentService, DocumentUploadError
from domain.enums import DocumentOrigin
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/documents", tags=["documents"])


class ConfidenceFields(BaseModel):
    global_score: float | None = Field(None, alias="global")
    fields: dict[str, float] = {}
    fields_detail: dict[str, dict] = {}

    model_config = {"populate_by_name": True}


class DocumentSummary(BaseModel):
    id: int
    filename: str
    tipo: str
    origen: str
    estado: str
    proveedor_nombre: str | None = None
    nit: str | None = None
    numero_documento: str | None = None
    total: float | None = None
    confidence_global: float | None = None
    requiere_revision: bool
    received_at: str


class DocumentListResponse(BaseModel):
    total: int
    items: list[DocumentSummary]


class DocumentDetail(BaseModel):
    id: int
    filename: str
    tipo: str
    origen: str
    estado: str
    provider: dict | None = None
    numero_documento: str | None = None
    fecha_emision: str | None = None
    subtotal: float | None = None
    iva: float | None = None
    total: float | None = None
    moneda: str | None = None
    concepto: str | None = None
    metodo_ocr: str | None = None
    confidence: ConfidenceFields
    requiere_revision: bool
    observaciones: str | None = None
    extracted: dict = {}
    ocr_preview: str = ""
    preview_url: str | None = None
    received_at: str
    updated_at: str


class UploadResponse(BaseModel):
    document: DocumentSummary
    duplicate_warning: str | None = None
    duplicate_document_id: int | None = None
    process_error: str | None = None


class EstadoUpdate(BaseModel):
    estado: str
    usuario: str | None = None


class ProcessResponse(BaseModel):
    ok: bool
    document_id: int
    estado: str
    error: str | None = None


@router.get("", response_model=DocumentListResponse)
def list_documents(
    limit: int = 50,
    offset: int = 0,
    estado: str | None = None,
    tipo: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    """Lista documentos con filtros opcionales."""
    service = DocumentService(db)
    docs, total = service.list_documents(
        limit=min(limit, 200),
        offset=offset,
        estado=estado,
        tipo=tipo,
        search=search,
    )
    return DocumentListResponse(
        total=total,
        items=[_to_summary(d) for d in docs],
    )


@router.post("/upload", response_model=UploadResponse)
async def upload_document(
    archivo: UploadFile = File(...),
    origen: str = Form(DocumentOrigin.CARGA_MANUAL),
    tipo: str = Form("FACTURA"),
    auto_procesar: bool = Form(True),
    db: Session = Depends(get_db),
):
    """Sube un documento y, por defecto, lo procesa con OCR + IA automáticamente."""
    content = await archivo.read()
    service = DocumentService(db)
    try:
        doc, dup = service.save_upload(
            content,
            archivo.filename or "documento.jpg",
            origen=origen,
            tipo=tipo,
        )
    except DocumentUploadError as e:
        raise HTTPException(status_code=400, detail=e.message) from e

    process_error = None
    if auto_procesar and not (dup and dup.is_duplicate):
        processor = get_document_processing_service()
        errores = processor.verify_dependencies()
        if not errores:
            result = processor.process_by_id(
                doc.id,
                None,
            )
            if not result.get("ok"):
                process_error = result.get("error") or "Procesamiento incompleto"
            # refrescar doc tras OCR+IA
            doc = service.get_document(doc.id) or doc
        else:
            process_error = " ".join(errores)

    return UploadResponse(
        document=_to_summary(doc),
        duplicate_warning=dup.reason if dup else None,
        duplicate_document_id=dup.existing_document_id if dup else None,
        process_error=process_error,
    )


class BatchUploadItem(BaseModel):
    filename: str
    document: DocumentSummary | None = None
    ok: bool = True
    duplicate_warning: str | None = None
    duplicate_document_id: int | None = None
    error: str | None = None


class BatchUploadResponse(BaseModel):
    total_recibidos: int
    total_errores: int
    total_duplicados: int
    pack_size: int
    packs: int
    queued_ids: list[int]
    items: list[BatchUploadItem]
    mensaje: str


class ProcessBatchRequest(BaseModel):
    document_ids: list[int]
    pack_size: int = 25


class ProcessBatchResponse(BaseModel):
    ok: bool
    queued: int
    pack_size: int
    packs: int
    document_ids: list[int]
    mensaje: str


BATCH_PACK_SIZE = 25


def _process_document_ids_in_packs(document_ids: list[int], pack_size: int = BATCH_PACK_SIZE) -> None:
    """Procesa IDs en paquetes; dentro del paquete hasta 3 en paralelo."""
    import logging
    from concurrent.futures import ThreadPoolExecutor, as_completed

    from domain.enums import DocumentStatus
    from infrastructure.persistence.database import SessionLocal
    from infrastructure.persistence.repositories import DocumentRepository

    logger = logging.getLogger(__name__)
    processor = get_document_processing_service()
    size = max(1, min(int(pack_size or BATCH_PACK_SIZE), 50))
    ids = [int(i) for i in document_ids if i]

    for offset in range(0, len(ids), size):
        pack = ids[offset : offset + size]
        db = SessionLocal()
        try:
            repo = DocumentRepository(db)
            for doc_id in pack:
                doc = repo.get_by_id(doc_id)
                if doc and doc.estado in {
                    DocumentStatus.RECIBIDO,
                    DocumentStatus.ERROR,
                    DocumentStatus.REQUIERE_REVISION,
                }:
                    doc.estado = DocumentStatus.PROCESANDO
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("No se pudo marcar pack como PROCESANDO")
        finally:
            db.close()

        with ThreadPoolExecutor(max_workers=min(3, len(pack))) as pool:
            futures = {pool.submit(processor.process_by_id, doc_id, None): doc_id for doc_id in pack}
            for fut in as_completed(futures):
                doc_id = futures[fut]
                try:
                    fut.result()
                except Exception:
                    logger.exception("Fallo procesando documento #%s en lote", doc_id)


@router.post("/upload-batch", response_model=BatchUploadResponse)
async def upload_documents_batch(
    background_tasks: BackgroundTasks,
    archivos: list[UploadFile] = File(...),
    origen: str = Form(DocumentOrigin.CARGA_MANUAL),
    tipo: str = Form("FACTURA"),
    auto_procesar: bool = Form(True),
    pack_size: int = Form(BATCH_PACK_SIZE),
    db: Session = Depends(get_db),
):
    """Sube muchas facturas y procesa en paquetes de `pack_size` (default 25)."""
    if not archivos:
        raise HTTPException(status_code=400, detail="No se recibieron archivos.")

    service = DocumentService(db)
    items: list[BatchUploadItem] = []
    queued_ids: list[int] = []
    dup_count = 0
    err_count = 0

    for archivo in archivos:
        filename = archivo.filename or "documento.jpg"
        try:
            content = await archivo.read()
            doc, dup = service.save_upload(
                content,
                filename,
                origen=origen,
                tipo=tipo,
            )
            warning = dup.reason if dup else None
            dup_id = dup.existing_document_id if dup else None
            if dup and dup.is_duplicate:
                dup_count += 1
            else:
                queued_ids.append(doc.id)
            items.append(
                BatchUploadItem(
                    filename=filename,
                    document=_to_summary(doc),
                    ok=True,
                    duplicate_warning=warning,
                    duplicate_document_id=dup_id,
                )
            )
        except DocumentUploadError as e:
            err_count += 1
            items.append(BatchUploadItem(filename=filename, ok=False, error=e.message))
        except Exception as e:
            err_count += 1
            items.append(BatchUploadItem(filename=filename, ok=False, error=str(e)))

    size = max(1, min(int(pack_size or BATCH_PACK_SIZE), 50))
    packs = (len(queued_ids) + size - 1) // size if queued_ids else 0

    if auto_procesar and queued_ids:
        processor = get_document_processing_service()
        errores = processor.verify_dependencies()
        if errores:
            return BatchUploadResponse(
                total_recibidos=len(items) - err_count,
                total_errores=err_count,
                total_duplicados=dup_count,
                pack_size=size,
                packs=packs,
                queued_ids=queued_ids,
                items=items,
                mensaje=(
                    f"{len(queued_ids)} archivo(s) guardados. "
                    "OCR/IA no disponible aún: " + " ".join(errores)
                ),
            )
        background_tasks.add_task(_process_document_ids_in_packs, list(queued_ids), size)
        mensaje = (
            f"{len(queued_ids)} factura(s) en cola · {packs} paquete(s) de hasta {size}. "
            "El análisis corre en segundo plano; refresque la lista para ver resultados."
        )
    else:
        mensaje = f"{len(queued_ids)} archivo(s) guardados sin procesar automáticamente."

    return BatchUploadResponse(
        total_recibidos=len(items) - err_count,
        total_errores=err_count,
        total_duplicados=dup_count,
        pack_size=size,
        packs=packs,
        queued_ids=queued_ids,
        items=items,
        mensaje=mensaje,
    )


@router.post("/process-batch", response_model=ProcessBatchResponse)
def process_documents_batch(
    body: ProcessBatchRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Encola el reprocesamiento de varios documentos en paquetes."""
    ids = [int(i) for i in (body.document_ids or []) if i]
    if not ids:
        raise HTTPException(status_code=400, detail="document_ids vacío.")

    service = DocumentService(db)
    valid: list[int] = []
    for doc_id in ids:
        doc = service.get_document(doc_id)
        if doc and doc.storage_path:
            valid.append(doc_id)

    if not valid:
        raise HTTPException(status_code=404, detail="Ningún documento válido para procesar.")

    processor = get_document_processing_service()
    errores = processor.verify_dependencies()
    if errores:
        raise HTTPException(status_code=503, detail=" ".join(errores))

    size = max(1, min(int(body.pack_size or BATCH_PACK_SIZE), 50))
    packs = (len(valid) + size - 1) // size
    background_tasks.add_task(_process_document_ids_in_packs, list(valid), size)
    return ProcessBatchResponse(
        ok=True,
        queued=len(valid),
        pack_size=size,
        packs=packs,
        document_ids=valid,
        mensaje=f"{len(valid)} documento(s) en {packs} paquete(s) de hasta {size}.",
    )


@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: int, db: Session = Depends(get_db)):
    """Detalle completo de un documento."""
    service = DocumentService(db)
    doc = service.get_document(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    data = service.to_detail_dict(doc)
    return DocumentDetail(**data)


@router.get("/{document_id}/preview")
def preview_document(document_id: int, db: Session = Depends(get_db)):
    """Sirve imagen del documento para vista previa."""
    from pathlib import Path

    service = DocumentService(db)
    doc = service.get_document(document_id)
    if not doc or not doc.storage_path:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    path = Path(doc.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(path)


@router.patch("/{document_id}/estado", response_model=DocumentSummary)
def update_estado(
    request: Request,
    document_id: int,
    body: EstadoUpdate,
    db: Session = Depends(get_db),
):
    """Actualiza el estado de un documento."""
    service = DocumentService(db)
    try:
        doc = service.update_estado(
            document_id,
            body.estado,
            resolve_usuario(request, body.usuario),
        )
    except DocumentUploadError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    return _to_summary(doc)


@router.delete("/{document_id}")
def delete_document(request: Request, document_id: int, db: Session = Depends(get_db)):
    """Elimina un documento y su archivo."""
    service = DocumentService(db)
    if not service.delete_document(document_id, resolve_usuario(request)):
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"ok": True, "deleted_id": document_id}


@router.post("/{document_id}/process", response_model=ProcessResponse)
def process_document(
    document_id: int,
    background_tasks: BackgroundTasks,
    solicitud: str | None = Form(None),
    async_mode: bool = Form(False),
    db: Session = Depends(get_db),
):
    """Procesa un documento ya subido con OCR + extracción estructurada de factura.

    async_mode=true (o PROCESS_ASYNC_DEFAULT) encola el trabajo y responde estado=PROCESANDO.
    """
    from pathlib import Path

    from config.settings import get_settings

    service = DocumentService(db)
    doc = service.get_document(document_id)
    if not doc or not doc.storage_path:
        raise HTTPException(status_code=404, detail="Documento no encontrado")

    path = Path(doc.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")

    processor = get_document_processing_service()
    errores = processor.verify_dependencies()
    if errores:
        raise HTTPException(status_code=503, detail=" ".join(errores))

    settings = get_settings()
    use_async = async_mode or bool(settings.process_async_default)
    if use_async:
        def _run() -> None:
            processor.process_by_id(document_id, solicitud)

        background_tasks.add_task(_run)
        return ProcessResponse(
            ok=True,
            document_id=document_id,
            estado="PROCESANDO",
            error=None,
        )

    result = processor.process_by_id(document_id, solicitud)
    estado = result.get("estado") or ("EXTRAIDO" if result.get("ok") else "ERROR")
    return ProcessResponse(
        ok=result.get("ok", False),
        document_id=document_id,
        estado=estado,
        error=result.get("error") or None,
    )


def _to_summary(doc) -> DocumentSummary:
    proveedor = doc.provider.nombre if doc.provider else None
    nit = doc.provider.nit if doc.provider else None
    return DocumentSummary(
        id=doc.id,
        filename=doc.filename,
        tipo=doc.tipo,
        origen=doc.origen,
        estado=doc.estado,
        proveedor_nombre=proveedor,
        nit=nit,
        numero_documento=doc.numero_documento,
        total=doc.total,
        confidence_global=doc.confidence_global,
        requiere_revision=doc.requiere_revision,
        received_at=doc.received_at.isoformat() if doc.received_at else "",
    )
