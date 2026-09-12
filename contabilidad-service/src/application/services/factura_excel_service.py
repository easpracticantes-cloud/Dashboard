"""Excel de resultado Facturas + Autobits. La alineación vive en CrossingService."""

from __future__ import annotations

from sqlalchemy.orm import Session

from application.services.cruce_excel_service import (
    CruceExcelService,
    CruceExcelServiceError,
)

FacturaExcelServiceError = CruceExcelServiceError


class FacturaExcelService:
    """Orquesta el XLSX desde un paquete de facturas (document_ids)."""

    def __init__(self, db: Session) -> None:
        self._inner = CruceExcelService(db)

    def generar_excel(
        self,
        *,
        document_ids: list[int] | None = None,
        usuario: str = "SISTEMA",
    ) -> tuple[bytes, str, dict]:
        return self._inner.generar_excel(
            batch_id=None,
            document_ids=document_ids,
            usuario=usuario,
        )
