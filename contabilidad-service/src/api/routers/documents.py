"""Routers API — dominio documentos (Fase 2)."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from application.services.document_processing_service import get_document_processing_service
from application.services.document_service import DocumentService, DocumentUploadError
from domain.enums import DocumentOrigin
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/documents", tags=["documents"])


class ConfidenceFields(BaseModel):
    global_score: float | None = Field(None, alias="global")
    fields: dict[str, float] = {}


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
    usuario: str = "SISTEMA"


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
                "Extrae numero de factura, proveedor, NIT, fecha de emision, "
                "subtotal, impuesto, total, moneda, compra y reserva.",
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
    document_id: int,
    body: EstadoUpdate,
    db: Session = Depends(get_db),
):
    """Actualiza el estado de un documento."""
    service = DocumentService(db)
    try:
        doc = service.update_estado(document_id, body.estado, body.usuario)
    except DocumentUploadError as e:
        raise HTTPException(status_code=404, detail=e.message) from e
    return _to_summary(doc)


@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db)):
    """Elimina un documento y su archivo."""
    service = DocumentService(db)
    if not service.delete_document(document_id):
        raise HTTPException(status_code=404, detail="Documento no encontrado")
    return {"ok": True, "deleted_id": document_id}


@router.post("/{document_id}/process", response_model=ProcessResponse)
def process_document(
    document_id: int,
    solicitud: str = Form(
        "Extrae numero de factura, proveedor, fecha de emision, subtotal, impuesto, total y moneda."
    ),
    db: Session = Depends(get_db),
):
    """Procesa un documento ya subido con OCR + IA."""
    from pathlib import Path

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

    result = processor.process_by_id(document_id, solicitud)
    return ProcessResponse(
        ok=result.get("ok", False),
        document_id=document_id,
        estado="EXTRAIDO" if result.get("ok") else "ERROR",
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
