"""Servicio de paquetes digitales para Katherine."""

from __future__ import annotations

import io
import json
import shutil
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory

from sqlalchemy.orm import Session

from domain.enums import DocumentStatus, PackageStatus, PaymentStatus, StorageFolderType
from infrastructure.persistence.models import DigitalPackageModel
from infrastructure.storage.local_storage_provider import LocalStorageProvider
from infrastructure.persistence.repositories import (
    AuditRepository,
    CrossingRepository,
    DocumentRepository,
    PackageRepository,
    PaymentRepository,
)


class PackageServiceError(Exception):
    def __init__(self, message: str, code: str = "PACKAGE_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class PackageService:
    DEFAULT_RESPONSABLE = "KATHERINE"

    def __init__(self, db: Session):
        self.db = db
        self.repo = PackageRepository(db)
        self.doc_repo = DocumentRepository(db)
        self.crossing_repo = CrossingRepository(db)
        self.payment_repo = PaymentRepository(db)
        self.audit = AuditRepository(db)
        self.storage = LocalStorageProvider()

    def list_packages(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        search: str | None = None,
    ) -> tuple[list[dict], int]:
        items, total = self.repo.list_packages(
            limit=limit, offset=offset, estado=estado, search=search
        )
        return [self.to_dict(p) for p in items], total

    def get_package(self, package_id: int) -> dict | None:
        package = self.repo.get_by_id(package_id)
        if not package:
            return None
        return self.to_dict(package)

    def create_from_document(
        self,
        document_id: int,
        *,
        payment_id: int | None = None,
        crossing_id: int | None = None,
        responsable: str | None = None,
        observaciones: str | None = None,
        period_start: str | None = None,
        period_end: str | None = None,
        usuario: str = "ANDREA",
    ) -> dict:
        doc = self.doc_repo.get_by_id(document_id)
        if not doc:
            raise PackageServiceError("Documento no encontrado.", "NOT_FOUND")

        existing = self.repo.get_by_document(document_id)
        if existing and existing.estado not in {PackageStatus.CERRADO}:
            raise PackageServiceError(
                "Ya existe un paquete activo para este documento.",
                "DUPLICATE",
            )

        crossing = None
        if crossing_id:
            crossing = self.crossing_repo.get_by_id(crossing_id)
        elif doc.crossings:
            crossing = doc.crossings[0]

        payment = None
        if payment_id:
            payment = self.payment_repo.get_by_id(payment_id)
        elif doc.payments:
            payment = next(
                (p for p in doc.payments if p.estado == PaymentStatus.COMPLETADO),
                doc.payments[0] if doc.payments else None,
            )

        package = self.repo.create(
            document_id=document_id,
            crossing_id=crossing.id if crossing else None,
            payment_id=payment.id if payment else None,
            responsable=responsable or self.DEFAULT_RESPONSABLE,
            observaciones=observaciones,
            period_start=period_start,
            period_end=period_end,
        )

        if doc.estado not in {DocumentStatus.PAQUETE_DIGITAL, DocumentStatus.FINALIZADO}:
            doc.estado = DocumentStatus.PAQUETE_DIGITAL

        self.audit.log("PAQUETE_CREADO", "DigitalPackage", str(package.id), usuario=usuario)
        self.db.commit()
        self.db.refresh(package)
        return self.to_dict(package)

    def generate(self, package_id: int, usuario: str = "ANDREA") -> dict:
        """Genera ZIP con documento, resumen y comprobantes."""
        package = self.repo.get_by_id(package_id)
        if not package:
            raise PackageServiceError("Paquete no encontrado.", "NOT_FOUND")

        doc = package.document
        if not doc:
            raise PackageServiceError("Documento del paquete no encontrado.", "NOT_FOUND")

        manifest = self._build_manifest(package)
        files_added: list[str] = []

        with TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            manifest_path = tmp_path / "resumen.json"
            manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            files_added.append("resumen.json")

            if doc.storage_path and Path(doc.storage_path).exists():
                src = Path(doc.storage_path)
                dest_name = f"documento_{doc.id}{src.suffix}"
                shutil.copy2(src, tmp_path / dest_name)
                files_added.append(dest_name)

            payment = package.payment
            if payment:
                for idx, receipt in enumerate(payment.receipts):
                    rpath = Path(receipt.storage_path)
                    if rpath.exists():
                        rname = f"comprobante_{idx + 1}{rpath.suffix}"
                        shutil.copy2(rpath, tmp_path / rname)
                        files_added.append(rname)

            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
                for item in tmp_path.iterdir():
                    zf.write(item, arcname=item.name)
            zip_content = buf.getvalue()
            zip_name = f"paquete_{package.id}_{doc.filename or doc.id}.zip"

        storage_path = self.storage.save(
            zip_content,
            zip_name,
            StorageFolderType.PAQUETES_DIGITALES,
        )

        manifest["files"] = files_added
        self.repo.update(
            package,
            estado=PackageStatus.GENERADO,
            storage_path=storage_path,
            manifest_json=json.dumps(manifest, ensure_ascii=False),
            generated_at=datetime.now(timezone.utc),
        )

        self.audit.log("PAQUETE_GENERADO", "DigitalPackage", str(package_id), usuario=usuario)
        self.db.commit()
        self.db.refresh(package)
        return self.to_dict(package)

    def update_estado(
        self,
        package_id: int,
        estado: str,
        *,
        observaciones: str | None = None,
        usuario: str = "ANDREA",
    ) -> dict:
        if estado not in PackageStatus:
            raise PackageServiceError(f"Estado inválido: {estado}", "INVALID_STATUS")

        package = self.repo.get_by_id(package_id)
        if not package:
            raise PackageServiceError("Paquete no encontrado.", "NOT_FOUND")

        delivered_at = None
        if estado == PackageStatus.ENTREGADO:
            delivered_at = datetime.now(timezone.utc)

        self.repo.update(
            package,
            estado=estado,
            observaciones=observaciones,
            delivered_at=delivered_at,
        )

        if estado == PackageStatus.CERRADO and package.document:
            package.document.estado = DocumentStatus.FINALIZADO

        self.audit.log(
            "CAMBIO_ESTADO_PAQUETE",
            "DigitalPackage",
            str(package_id),
            valor_nuevo=estado,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(package)
        return self.to_dict(package)

    def get_download_path(self, package_id: int) -> Path:
        package = self.repo.get_by_id(package_id)
        if not package or not package.storage_path:
            raise PackageServiceError("Paquete no generado o sin archivo.", "NOT_FOUND")
        path = Path(package.storage_path)
        if not path.exists():
            raise PackageServiceError("Archivo del paquete no encontrado en disco.", "NOT_FOUND")
        return path

    def _build_manifest(self, package: DigitalPackageModel) -> dict:
        doc = package.document
        crossing = package.crossing
        payment = package.payment

        manifest: dict = {
            "package_id": package.id,
            "documento": {
                "id": doc.id if doc else None,
                "filename": doc.filename if doc else None,
                "numero": doc.numero_documento if doc else None,
                "proveedor": doc.provider.nombre if doc and doc.provider else None,
                "total": doc.total if doc else None,
                "estado": doc.estado if doc else None,
            },
            "cruce": None,
            "pago": None,
            "observaciones": package.observaciones,
            "responsable": package.responsable,
            "periodo": {"inicio": package.period_start, "fin": package.period_end},
        }

        if crossing:
            manifest["cruce"] = {
                "id": crossing.id,
                "match_type": crossing.match_type,
                "estado": crossing.estado,
                "valor_documento": crossing.valor_documento,
                "valor_autobits": crossing.valor_autobits,
                "diferencia": crossing.diferencia,
            }

        if payment:
            manifest["pago"] = {
                "id": payment.id,
                "estado": payment.estado,
                "valor": payment.valor,
                "comprobantes": len(payment.receipts),
            }

        return manifest

    def to_dict(self, package: DigitalPackageModel) -> dict:
        doc = package.document
        manifest = None
        if package.manifest_json:
            try:
                manifest = json.loads(package.manifest_json)
            except json.JSONDecodeError:
                manifest = None

        return {
            "id": package.id,
            "document_id": package.document_id,
            "document_filename": doc.filename if doc else None,
            "document_numero": doc.numero_documento if doc else None,
            "proveedor": doc.provider.nombre if doc and doc.provider else None,
            "crossing_id": package.crossing_id,
            "payment_id": package.payment_id,
            "estado": package.estado,
            "responsable": package.responsable,
            "observaciones": package.observaciones,
            "storage_path": package.storage_path,
            "has_zip": bool(package.storage_path),
            "download_url": f"/api/packages/{package.id}/download" if package.storage_path else None,
            "manifest": manifest,
            "period_start": package.period_start,
            "period_end": package.period_end,
            "generated_at": package.generated_at.isoformat() if package.generated_at else None,
            "delivered_at": package.delivered_at.isoformat() if package.delivered_at else None,
            "created_at": package.created_at.isoformat() if package.created_at else "",
        }
