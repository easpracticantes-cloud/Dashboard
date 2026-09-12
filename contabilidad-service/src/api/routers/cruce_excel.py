"""Router API — Cruce de Cuentas (análisis SIG + Excel de salida)."""

import csv
import io

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy.orm import Session

from api.deps import resolve_usuario
from application.services.cruce_excel_service import (
    CruceExcelService,
    CruceExcelServiceError,
    TIPOS_PENDIENTE,
)
from infrastructure.cruce.xlsx_integrity import XlsxIntegrityError
from infrastructure.persistence.database import get_db

router = APIRouter(prefix="/api/cruce-excel", tags=["cruce-excel"])

_EXTENSIONES = (".xlsx", ".xlsm")
_XLSX_MEDIA = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.post("/analizar")
def analizar_cruce(
    request: Request,
    batch_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Analiza Autobits, facturas y proveedores ya persistidos. No requiere Excel."""
    service = CruceExcelService(db)
    try:
        return service.analizar_desde_sistema(
            batch_id=batch_id,
            usuario=resolve_usuario(request),
        )
    except CruceExcelServiceError as exc:
        raise HTTPException(
            status_code=getattr(exc, "status_code", 400) or 400,
            detail=exc.message,
        ) from exc


def _parse_document_ids(raw: str | None) -> list[int] | None:
    if not raw:
        return None
    ids: list[int] = []
    for part in raw.split(","):
        part = part.strip()
        if part.isdigit():
            ids.append(int(part))
    return ids or None


@router.get("/export.xlsx")
@router.get("/export")
def exportar_excel(
    request: Request,
    batch_id: int | None = None,
    document_ids: str | None = None,
    db: Session = Depends(get_db),
):
    """Genera el Excel estándar de Cruce de Cuentas a partir de SIG."""
    service = CruceExcelService(db)
    try:
        content, filename, _analisis = service.generar_excel(
            batch_id=batch_id,
            document_ids=_parse_document_ids(document_ids),
            usuario=resolve_usuario(request),
        )
    except CruceExcelServiceError as exc:
        raise HTTPException(
            status_code=getattr(exc, "status_code", 400) or 400,
            detail=exc.message,
        ) from exc
    except XlsxIntegrityError as exc:
        raise HTTPException(
            status_code=500,
            detail="No se pudo generar un Excel válido para Microsoft Excel.",
        ) from exc
    return Response(
        content=content,
        media_type=_XLSX_MEDIA,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
