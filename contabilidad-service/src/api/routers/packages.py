"""Routers API — paquetes digitales (Fase 7)."""

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from application.services.package_service import PackageService, PackageServiceError
from infrastructure.persistence.database import get_db
from infrastructure.storage import storage_status

router = APIRouter(prefix="/api/packages", tags=["packages"])


class PackageListResponse(BaseModel):
    total: int
    items: list[dict]


class PackageCreate(BaseModel):
    document_id: int
    payment_id: int | None = None
    crossing_id: int | None = None
    responsable: str = "KATHERINE"
    observaciones: str | None = None
    period_start: str | None = None
    period_end: str | None = None
    usuario: str = "ANDREA"


class PackageEstadoUpdate(BaseModel):
    estado: str
    observaciones: str | None = None
    usuario: str = "ANDREA"


@router.get("/storage/status")
def get_storage_status():
    """Estado de proveedores de almacenamiento."""
    return storage_status()


@router.get("", response_model=PackageListResponse)
def list_packages(
    limit: int = 50,
    offset: int = 0,
    estado: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    """Lista paquetes digitales."""
    service = PackageService(db)
    items, total = service.list_packages(
        limit=min(limit, 200), offset=offset, estado=estado, search=search
    )
    return PackageListResponse(total=total, items=items)


@router.get("/{package_id}")
def get_package(package_id: int, db: Session = Depends(get_db)):
    """Detalle de paquete digital."""
    service = PackageService(db)
    data = service.get_package(package_id)
    if not data:
        raise HTTPException(status_code=404, detail="Paquete no encontrado")
    return data


@router.post("")
def create_package(body: PackageCreate, db: Session = Depends(get_db)):
    """Crea paquete digital pendiente de generación."""
    service = PackageService(db)
    try:
        return service.create_from_document(
            body.document_id,
            payment_id=body.payment_id,
            crossing_id=body.crossing_id,
            responsable=body.responsable,
            observaciones=body.observaciones,
            period_start=body.period_start,
            period_end=body.period_end,
            usuario=body.usuario,
        )
    except PackageServiceError as exc:
        status = 404 if exc.code == "NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc


@router.post("/{package_id}/generate")
def generate_package(package_id: int, db: Session = Depends(get_db)):
    """Genera ZIP del paquete para entrega."""
    service = PackageService(db)
    try:
        return service.generate(package_id)
    except PackageServiceError as exc:
        raise HTTPException(status_code=400, detail=exc.message) from exc


@router.patch("/{package_id}/estado")
def update_package_estado(
    package_id: int,
    body: PackageEstadoUpdate,
    db: Session = Depends(get_db),
):
    """Actualiza estado (ENTREGADO, DIGITALIZADO, CERRADO…)."""
    service = PackageService(db)
    try:
        return service.update_estado(
            package_id,
            body.estado,
            observaciones=body.observaciones,
            usuario=body.usuario,
        )
    except PackageServiceError as exc:
        status = 404 if exc.code == "NOT_FOUND" else 400
        raise HTTPException(status_code=status, detail=exc.message) from exc


@router.get("/{package_id}/download")
def download_package(package_id: int, db: Session = Depends(get_db)):
    """Descarga ZIP del paquete generado."""
    service = PackageService(db)
    try:
        path = service.get_download_path(package_id)
    except PackageServiceError as exc:
        raise HTTPException(status_code=404, detail=exc.message) from exc
    return FileResponse(
        path,
        media_type="application/zip",
        filename=path.name,
    )
