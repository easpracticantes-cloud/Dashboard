"""Router API — Excel de trabajo «CRUCE DE CUENTAS»."""

import csv
import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from api.deps import resolve_usuario
from application.services.cruce_excel_service import (
    CruceExcelService,
    CruceExcelServiceError,
    TIPOS_PENDIENTE,
)
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/cruce-excel", tags=["cruce-excel"])

_EXTENSIONES = (".xlsx", ".xlsm")


@router.post("/upload")
async def upload_cruce(
    request: Request,
    archivo: UploadFile = File(...),
    aplicar: bool = Form(True),
    force: bool = Form(False),
    usuario: str | None = Form(None),
    db: Session = Depends(get_db),
):
    """Sube el Excel de cruce, lo compara con Autobits y reporta lo que falta."""
    nombre = (archivo.filename or "").lower()
    if not nombre.endswith(_EXTENSIONES):
        raise HTTPException(
            status_code=400,
            detail="El cruce de cuentas debe ser .xlsx o .xlsm (descárguelo de Google Sheets como Excel).",
        )

    content = await archivo.read()
    service = CruceExcelService(db)
    try:
        return service.procesar_archivo(
            content,
            archivo.filename or "cruce.xlsx",
            aplicar=aplicar,
            usuario=resolve_usuario(request, usuario),
            force=force,
        )
    except CruceExcelServiceError as exc:
        raise HTTPException(
            status_code=getattr(exc, "status_code", 400) or 400,
            detail=exc.message,
        ) from exc


@router.get("/pendientes")
def listar_pendientes(batch_id: int | None = None, db: Session = Depends(get_db)):
    """Lo que falta por llenar según el estado actual del sistema."""
    service = CruceExcelService(db)
    return service.pendientes(batch_id=batch_id)


@router.get("/tipos")
def listar_tipos():
    """Catálogo de tipos de pendiente."""
    return {"tipos": [{"key": k, "label": v} for k, v in TIPOS_PENDIENTE.items()]}


@router.get("/pendientes/export", response_class=PlainTextResponse)
def exportar_pendientes(batch_id: int | None = None, db: Session = Depends(get_db)):
    """CSV con lo que falta por llenar, para revisar fuera del sistema."""
    service = CruceExcelService(db)
    data = service.pendientes(batch_id=batch_id)

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    writer.writerow(
        ["TIPO", "PENDIENTE", "DETALLE", "PROVEEDOR", "COMPRA", "RESERVA", "VALOR", "CRUCE_ID"]
    )
    for tipo, items in data["pendientes"]["por_tipo"].items():
        for item in items:
            writer.writerow(
                [
                    tipo,
                    item.get("titulo") or "",
                    item.get("detalle") or "",
                    item.get("proveedor") or "",
                    item.get("numero_compra") or "",
                    item.get("numero_reserva") or "",
                    item.get("valor") if item.get("valor") is not None else "",
                    item.get("crossing_id") or "",
                ]
            )
    return PlainTextResponse(
        buffer.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="pendientes_cruce.csv"'},
    )
