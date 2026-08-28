"""Routers API — pagos y comprobantes (Fase 6)."""

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from pydantic import BaseModel
from pathlib import Path
from sqlalchemy.orm import Session

from application.services.payment_service import PaymentService, PaymentServiceError
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/payments", tags=["payments"])


class PaymentListResponse(BaseModel):
    total: int
    items: list[dict]


class CreateFromCrossingRequest(BaseModel):
    crossing_id: int
    usuario: str = "ANDREA"


class MarkPaidRequest(BaseModel):
    observaciones: str | None = None
    usuario: str = "ANDREA"


class ApproveRequest(BaseModel):
    usuario: str = "ANDREA"


@router.get("", response_model=PaymentListResponse)
def list_payments(
    limit: int = 50,
    offset: int = 0,
    estado: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    """Lista pagos con filtros."""
    service = PaymentService(db)
    items, total = service.list_payments(
        limit=min(limit, 200), offset=offset, estado=estado, search=search
    )
    return PaymentListResponse(total=total, items=items)


@router.get("/export/pending")
def export_pending(db: Session = Depends(get_db)):
    """Exporta CSV de pagos pendientes de ejecución en Bancolombia."""
    service = PaymentService(db)
    csv_content = service.export_pending_csv()
    return PlainTextResponse(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="pagos_pendientes.csv"'},
    )


@router.get("/{payment_id}")
def get_payment(payment_id: int, db: Session = Depends(get_db)):
    """Detalle de un pago."""
    service = PaymentService(db)
    data = service.get_payment(payment_id)
    if not data:
        raise HTTPException(status_code=404, detail="Pago no encontrado")
    return data


@router.post("")
def create_from_crossing(body: CreateFromCrossingRequest, db: Session = Depends(get_db)):
    """Genera pago desde un cruce aprobado."""
    service = PaymentService(db)
    try:
        return service.create_from_crossing(body.crossing_id, body.usuario)
    except PaymentServiceError as exc:
        status = 404 if exc.code == "NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc


@router.post("/{payment_id}/approve")
def approve_payment(payment_id: int, body: ApproveRequest, db: Session = Depends(get_db)):
    """Aprueba pago → queda PENDIENTE_PAGO para ejecución manual."""
    service = PaymentService(db)
    try:
        return service.approve(payment_id, body.usuario)
    except PaymentServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc


@router.post("/{payment_id}/mark-paid")
def mark_paid(payment_id: int, body: MarkPaidRequest, db: Session = Depends(get_db)):
    """Andrea confirma pago ejecutado manualmente en Bancolombia."""
    service = PaymentService(db)
    try:
        return service.mark_paid(payment_id, body.usuario, body.observaciones)
    except PaymentServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc


@router.post("/{payment_id}/receipt")
async def upload_receipt(
    payment_id: int,
    archivo: UploadFile = File(...),
    contramarcado: bool = Form(False),
    usuario: str = Form("ANDREA"),
    db: Session = Depends(get_db),
):
    """Sube comprobante de pago."""
    content = await archivo.read()
    service = PaymentService(db)
    try:
        return service.upload_receipt(
            payment_id,
            content,
            archivo.filename or "comprobante.pdf",
            contramarcado=contramarcado,
            usuario=usuario,
        )
    except PaymentServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc


@router.get("/{payment_id}/receipts/{receipt_id}/preview")
def preview_receipt(payment_id: int, receipt_id: int, db: Session = Depends(get_db)):
    """Sirve comprobante para vista previa."""
    service = PaymentService(db)
    payment = service.get_payment(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Pago no encontrado")

    from infrastructure.persistence.repositories import PaymentRepository

    repo = PaymentRepository(db)
    receipt = repo.get_receipt(receipt_id)
    if not receipt or receipt.payment_id != payment_id:
        raise HTTPException(status_code=404, detail="Comprobante no encontrado")

    path = Path(receipt.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Archivo no encontrado en disco")
    return FileResponse(path)


@router.post("/{payment_id}/complete")
def complete_payment(payment_id: int, body: ApproveRequest, db: Session = Depends(get_db)):
    """Completa pago (requiere comprobante)."""
    service = PaymentService(db)
    try:
        return service.complete(payment_id, body.usuario)
    except PaymentServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc
