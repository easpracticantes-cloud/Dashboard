"""Servicio de cruce documento ↔ Autobits."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from domain.autobits.business_key import business_key_from_record
from domain.autobits.observaciones import (
    estado_compra_from_record,
    observaciones_from_record,
    resolve_crossing_estado,
)
from domain.enums import CrossingStatus, DocumentStatus, MatchType, RemediationType
from domain.matching.matching_engine import MatchingEngine, extract_document_context
from domain.rules.rule_engine import RuleEngine
from infrastructure.persistence.models import AccountCrossingModel, AutobitsRecordModel, DocumentModel
from infrastructure.persistence.repositories import (
    AuditRepository,
    AutobitsRepository,
    CrossingRepository,
    DocumentRepository,
)

_GENERIC_OBS = "Fila de cruce generada desde Autobits. Complete FACTURA/CDC y FECHA DE PAGO."


class CrossingServiceError(Exception):
    def __init__(self, message: str, code: str = "CROSSING_ERROR"):
        super().__init__(message)
        self.message = message
        self.code = code


class CrossingService:
    def __init__(self, db: Session):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.autobits_repo = AutobitsRepository(db)
        self.crossing_repo = CrossingRepository(db)
        self.audit = AuditRepository(db)
        self.matcher = MatchingEngine()
        self.rules = RuleEngine()

    def run_matching(
        self,
        *,
        batch_id: int | None = None,
        document_id: int | None = None,
        force: bool = False,
        usuario: str = "SISTEMA",
    ) -> dict:
        documents = self.doc_repo.list_for_crossing(
            batch_id=batch_id,
            document_id=document_id,
            force=force,
        )
        if batch_id:
            records = self.autobits_repo.list_records_for_batch(batch_id)
        else:
            records = self.autobits_repo.list_all_records()

        if not records:
            raise CrossingServiceError(
                "No hay registros Autobits importados. Importe un Excel primero.",
                "NO_AUTOBITS",
            )

        used_record_ids: set[int] = set()
        created = 0
        results: list[dict] = []

        for doc in documents:
            available = [r for r in records if r.id not in used_record_ids]
            crossing_result = self._match_document(doc, available)
            if crossing_result:
                results.append(crossing_result)
                created += 1
                if crossing_result.get("autobits_record_id"):
                    used_record_ids.add(crossing_result["autobits_record_id"])
                doc.estado = DocumentStatus.CRUZANDO

        self.audit.log(
            "CRUCE_AUTOMATICO",
            "Crossing",
            "batch" if batch_id else "all",
            valor_nuevo=f"{created} cruces generados",
            usuario=usuario,
        )
        self.db.commit()
        return {"created": created, "items": results}

    def _match_document(
        self,
        doc: DocumentModel,
        records: list[AutobitsRecordModel],
    ) -> dict | None:
        ctx = extract_document_context(doc)
        candidate = self.matcher.find_best_match(doc, records)

        record: AutobitsRecordModel | None = None
        existing: AccountCrossingModel | None = None
        if candidate and candidate.autobits_record_id:
            record = next((r for r in records if r.id == candidate.autobits_record_id), None)
            if record:
                existing = self.crossing_repo.get_by_autobits_record(record.id)
                if existing and existing.document_id and existing.document_id != doc.id:
                    # Otra factura ya ocupó esa fila del Excel.
                    candidate = None
                    record = None
                    existing = None

        if not candidate:
            candidate = self.matcher.build_sin_match(doc)
            existing = None

        estado, remediation_types, obs = self.rules.evaluate_crossing(
            ctx,
            candidate,
            record_nit=record.nit if record else None,
        )

        if existing:
            # La fila ya existía desde el Excel: la factura la completa.
            crossing = self._attach_document(existing, doc, candidate, estado, obs)
        else:
            crossing = self.crossing_repo.create_crossing(
                document_id=doc.id,
                autobits_record_id=candidate.autobits_record_id or None,
                match_type=candidate.match_type,
                match_score=candidate.score if candidate.score else None,
                estado=estado,
                proveedor_nombre=candidate.proveedor,
                numero_compra=candidate.numero_compra,
                numero_reserva=candidate.numero_reserva,
                valor_documento=candidate.valor_documento,
                valor_autobits=candidate.valor_autobits,
                diferencia=candidate.diferencia,
                observaciones="; ".join(obs) if obs else None,
                match_reasons=json.dumps(candidate.reasons, ensure_ascii=False),
            )

        for rem_type in remediation_types:
            self.crossing_repo.create_remediation(
                document_id=doc.id,
                crossing_id=crossing.id,
                proveedor=candidate.proveedor,
                tipo_problema=rem_type,
                descripcion=self._remediation_description(rem_type, candidate),
                valor_involucrado=candidate.diferencia or candidate.valor_documento,
            )
            if rem_type != RemediationType.SIN_MATCH:
                doc.estado = DocumentStatus.SUBSANACION

        if estado == CrossingStatus.APROBADO:
            doc.estado = DocumentStatus.APROBADO

        return self.to_dict(crossing, doc)

    def _attach_document(
        self,
        crossing: AccountCrossingModel,
        doc: DocumentModel,
        candidate,
        estado: str,
        obs: list[str],
    ) -> AccountCrossingModel:
        """Vincula la factura a la fila que ya venía del Excel de Autobits.

        Conserva lo digitado a mano (FACTURA/CDC, FECHA DE PAGO) y no degrada
        una fila que ya está pagada.
        """
        crossing.document_id = doc.id
        crossing.match_type = candidate.match_type
        crossing.match_score = candidate.score if candidate.score else crossing.match_score
        crossing.valor_documento = candidate.valor_documento
        crossing.diferencia = candidate.diferencia
        if candidate.valor_autobits is not None:
            crossing.valor_autobits = candidate.valor_autobits
        if candidate.proveedor:
            crossing.proveedor_nombre = candidate.proveedor
        if candidate.numero_compra:
            crossing.numero_compra = candidate.numero_compra
        if candidate.numero_reserva:
            crossing.numero_reserva = candidate.numero_reserva

        nuevas_obs = "; ".join(obs) if obs else None
        actual = (crossing.observaciones or "").strip()
        if nuevas_obs and (not actual or actual == _GENERIC_OBS):
            crossing.observaciones = nuevas_obs

        if crossing.estado != CrossingStatus.PAGADO:
            crossing.estado = estado

        crossing.match_reasons = json.dumps(
            ["fila_excel_completada"] + candidate.reasons, ensure_ascii=False
        )
        self.db.flush()
        return crossing

    def _remediation_description(self, rem_type: RemediationType, candidate) -> str:
        messages = {
            RemediationType.SIN_MATCH: "No se encontró coincidencia en Autobits para este documento.",
            RemediationType.DIFERENCIA_VALOR: f"Diferencia de valor detectada: {candidate.diferencia}.",
            RemediationType.SIN_NUMERO_DOCUMENTO: "Falta número de documento o compra en la factura.",
            RemediationType.SIN_PROVEEDOR: "No se identificó proveedor en el documento.",
            RemediationType.COMPRA_SIN_RESERVA: "Existe compra pero no hay reserva vinculada.",
            RemediationType.NIT_NO_COINCIDE: "El NIT del documento no coincide con Autobits.",
        }
        return messages.get(rem_type, "Revisión contable requerida.")

    def list_crossings(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        estado: str | None = None,
        match_type: str | None = None,
        batch_id: int | None = None,
        proveedor: str | None = None,
    ) -> tuple[list[dict], int]:
        items, total = self.crossing_repo.list_crossings(
            limit=limit,
            offset=offset,
            estado=estado,
            match_type=match_type,
            batch_id=batch_id,
            proveedor=proveedor,
        )
        return [self.to_dict(c, c.document) for c in items], total

    def seed_from_autobits(
        self,
        *,
        batch_id: int | None = None,
        use_latest: bool = True,
        usuario: str = "ANDREA",
    ) -> dict:
        """
        Genera/actualiza el cruce de cuentas desde Autobits.

        Por defecto usa el último Excel importado (semana vigente).
        Reconcilia por clave de negocio (NIT + compra + reserva) para conservar
        factura/CDC y fecha de pago ya digitadas.
        """
        resolved_batch_id = batch_id
        if resolved_batch_id is None and use_latest:
            latest = self.autobits_repo.get_latest_batch()
            if not latest:
                raise CrossingServiceError(
                    "No hay importaciones Autobits. Suba el Excel de la semana primero.",
                    "NO_AUTOBITS",
                )
            resolved_batch_id = latest.id

        if resolved_batch_id:
            records = self.autobits_repo.list_records_for_batch(resolved_batch_id)
            batch = self.autobits_repo.get_batch(resolved_batch_id)
        else:
            records = self.autobits_repo.list_all_records()
            batch = None

        if not records:
            raise CrossingServiceError(
                "No hay registros en el Excel seleccionado.",
                "NO_AUTOBITS",
            )

        active_keys = {k for r in records if (k := business_key_from_record(r))}
        key_index = self.crossing_repo.find_desde_autobits_by_keys(active_keys)

        created = 0
        updated = 0
        changed = 0
        items: list[dict] = []

        for record in records:
            obs = observaciones_from_record(record)
            estado_compra = estado_compra_from_record(record)
            if obs and not (getattr(record, "observaciones", None) or "").strip():
                record.observaciones = obs
            if estado_compra and not (getattr(record, "estado_compra", None) or "").strip():
                record.estado_compra = estado_compra

            bkey = business_key_from_record(record)
            existing = self.crossing_repo.get_by_autobits_record(record.id)
            if not existing and bkey:
                existing = key_index.get(bkey)

            if existing:
                if existing.autobits_record_id != record.id:
                    existing.autobits_record_id = record.id
                existing.import_batch_id = resolved_batch_id
                if existing.estado == CrossingStatus.ARCHIVADO:
                    existing.estado = CrossingStatus.PENDIENTE
                if self._sync_crossing_from_autobits(existing, record, obs, estado_compra):
                    changed += 1
                # La fila ya existía y se reconcilió con el Excel vigente:
                # cuenta como actualizada aunque no cambien los datos.
                updated += 1
                items.append(self.to_dict(existing, existing.document))
                continue

            estado = resolve_crossing_estado(
                factura_cdc=None,
                fecha_pago=None,
                observaciones=obs,
                estado_compra=estado_compra,
            )
            crossing = self.crossing_repo.create_crossing(
                document_id=None,
                autobits_record_id=record.id,
                import_batch_id=resolved_batch_id,
                match_type=MatchType.DESDE_AUTOBITS,
                match_score=100.0,
                estado=estado,
                proveedor_nombre=record.proveedor,
                nit=record.nit,
                numero_compra=record.numero_compra,
                numero_reserva=record.numero_reserva,
                fecha_ejecucion=record.fecha,
                concepto=record.concepto,
                valor_documento=None,
                valor_autobits=record.valor,
                diferencia=None,
                observaciones=obs,
                match_reasons=json.dumps(["desde_autobits"], ensure_ascii=False),
            )
            items.append(self.to_dict(crossing, None))
            created += 1

        archived = 0
        if resolved_batch_id:
            archived = self.crossing_repo.archive_stale_desde_autobits(
                active_batch_id=resolved_batch_id,
                active_record_ids={r.id for r in records},
                active_keys=active_keys,
            )

        self.audit.log(
            "CRUCE_DESDE_AUTOBITS",
            "Crossing",
            str(resolved_batch_id or "all"),
            valor_nuevo=(
                f"{created} creadas, {updated} reconciliadas "
                f"({changed} con cambios), {archived} archivadas"
            ),
            usuario=usuario,
        )
        self.db.commit()
        return {
            "created": created,
            "updated": updated,
            "changed": changed,
            "archived": archived,
            "skipped": 0,
            "batch_id": resolved_batch_id,
            "batch": self._batch_summary(batch) if batch else None,
            "items": items,
        }

    def get_context(self, batch_id: int | None = None) -> dict:
        """Contexto contable: Excel vigente + resumen del cruce."""
        batch = None
        if batch_id:
            batch = self.autobits_repo.get_batch(batch_id)
        if not batch:
            batch = self.autobits_repo.get_latest_batch()

        if not batch:
            return {
                "has_autobits": False,
                "batch": None,
                "counts": {},
                "totals": {},
                "workflow": self._workflow_steps(),
            }

        counts = self.crossing_repo.count_by_estado_for_batch(batch.id)
        records, record_total = self.autobits_repo.list_records(
            limit=1, offset=0, batch_id=batch.id
        )
        items, crossing_total = self.crossing_repo.list_crossings(
            limit=500, offset=0, batch_id=batch.id
        )
        valor_pendiente = sum(
            c.valor_autobits or 0
            for c in items
            if c.estado in (CrossingStatus.PENDIENTE, CrossingStatus.EN_REVISION, CrossingStatus.APROBADO)
        )
        valor_pagado = sum(
            c.valor_autobits or 0 for c in items if c.estado == CrossingStatus.PAGADO
        )

        return {
            "has_autobits": True,
            "batch": self._batch_summary(batch),
            "record_total": record_total,
            "crossing_total": crossing_total,
            "counts": counts,
            "totals": {
                "valor_pendiente_pago": valor_pendiente,
                "valor_pagado": valor_pagado,
            },
            "workflow": self._workflow_steps(),
        }

    def _batch_summary(self, batch) -> dict:
        return {
            "id": batch.id,
            "filename": batch.filename,
            "period_start": batch.period_start,
            "period_end": batch.period_end,
            "imported_rows": batch.imported_rows,
            "imported_at": batch.imported_at.isoformat() if batch.imported_at else "",
            "imported_by": batch.imported_by,
        }

    def _workflow_steps(self) -> list[dict]:
        return [
            {"step": 1, "title": "Excel Autobits", "hint": "Semana sábado–viernes"},
            {"step": 2, "title": "Facturas proveedores", "hint": "WhatsApp, correo o DIAN"},
            {"step": 3, "title": "Cruce de cuentas", "hint": "Adjunte su Excel de cruce"},
            {"step": 4, "title": "Reporte de pagos", "hint": "Filas aprobadas → Bancolombia"},
            {"step": 5, "title": "Comprobantes", "hint": "Contramarcar y subir al Drive"},
            {"step": 6, "title": "Autobits + paquete", "hint": "Actualizar plataforma y digitalizar"},
        ]

    def create_payments_from_batch(
        self,
        *,
        batch_id: int | None = None,
        usuario: str = "ANDREA",
    ) -> dict:
        """Genera pagos pendientes desde filas APROBADAS del Excel vigente."""
        from application.services.payment_service import PaymentService

        resolved = batch_id
        if not resolved:
            latest = self.autobits_repo.get_latest_batch()
            if not latest:
                raise CrossingServiceError("No hay Excel Autobits importado.", "NO_AUTOBITS")
            resolved = latest.id

        items, _ = self.crossing_repo.list_crossings(
            limit=500,
            offset=0,
            batch_id=resolved,
            estado=CrossingStatus.APROBADO,
        )
        payment_svc = PaymentService(self.db)
        created = 0
        skipped = 0
        errors: list[str] = []
        for crossing in items:
            try:
                payment_svc.create_from_crossing(crossing.id, usuario=usuario)
                created += 1
            except Exception as exc:
                msg = getattr(exc, "message", str(exc))
                if "DUPLICATE" in str(getattr(exc, "code", "")):
                    skipped += 1
                else:
                    errors.append(f"Cruce #{crossing.id}: {msg}")
        return {"created": created, "skipped": skipped, "errors": errors, "batch_id": resolved}

    def _sync_crossing_from_autobits(
        self,
        crossing: AccountCrossingModel,
        record: AutobitsRecordModel,
        obs: str | None,
        estado_compra: str | None,
    ) -> bool:
        """Actualiza obs/estado desde Autobits; respeta factura/CDC y fecha de pago ya cargadas."""
        changed = False
        for attr, value in (
            ("proveedor_nombre", record.proveedor),
            ("nit", record.nit),
            ("numero_compra", record.numero_compra),
            ("numero_reserva", record.numero_reserva),
            ("fecha_ejecucion", record.fecha),
            ("concepto", record.concepto),
            ("valor_autobits", record.valor),
        ):
            if value is not None and getattr(crossing, attr) != value:
                setattr(crossing, attr, value)
                changed = True

        current_obs = (crossing.observaciones or "").strip() or None
        new_obs = (obs or "").strip() or None
        user_completed = bool(
            (crossing.factura_cdc or "").strip() or (crossing.fecha_pago or "").strip()
        )
        if crossing.match_type == MatchType.DESDE_AUTOBITS:
            if not user_completed:
                if current_obs != new_obs:
                    crossing.observaciones = new_obs
                    changed = True
            elif (not current_obs or current_obs == _GENERIC_OBS) and new_obs:
                crossing.observaciones = new_obs
                changed = True

        new_estado = resolve_crossing_estado(
            factura_cdc=crossing.factura_cdc,
            fecha_pago=crossing.fecha_pago,
            observaciones=new_obs or crossing.observaciones,
            estado_compra=estado_compra,
        )
        if crossing.estado != new_estado:
            crossing.estado = new_estado
            changed = True
        return changed

    def complete_row(
        self,
        crossing_id: int,
        *,
        factura_cdc: str | None = None,
        fecha_pago: str | None = None,
        observaciones: str | None = None,
        usuario: str = "ANDREA",
    ) -> dict:
        """Completa el cruce como en el Excel: FACTURA/CDC (texto) y FECHA DE PAGO."""
        crossing = self.crossing_repo.get_by_id(crossing_id)
        if not crossing:
            raise CrossingServiceError("Cruce no encontrado.", "NOT_FOUND")

        if factura_cdc is not None:
            crossing.factura_cdc = factura_cdc.strip() or None
        if fecha_pago is not None:
            crossing.fecha_pago = fecha_pago.strip() or None
        if observaciones is not None:
            crossing.observaciones = observaciones

        estado_compra = None
        if crossing.autobits_record_id:
            record = self.autobits_repo.get_record(crossing.autobits_record_id)
            if record:
                estado_compra = estado_compra_from_record(record)
                if observaciones is None and not (crossing.observaciones or "").strip():
                    crossing.observaciones = observaciones_from_record(record)

        crossing.estado = resolve_crossing_estado(
            factura_cdc=crossing.factura_cdc,
            fecha_pago=crossing.fecha_pago,
            observaciones=crossing.observaciones,
            estado_compra=estado_compra,
        )

        crossing.approved_by = usuario
        self.audit.log(
            "CRUCE_COMPLETADO",
            "AccountCrossing",
            str(crossing_id),
            valor_nuevo=f"factura={crossing.factura_cdc or '-'} pago={crossing.fecha_pago or '-'}",
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(crossing)
        return self.to_dict(crossing, crossing.document)

    def list_proveedores(self) -> list[str]:
        rows = (
            self.db.query(AccountCrossingModel.proveedor_nombre)
            .filter(AccountCrossingModel.proveedor_nombre.isnot(None))
            .distinct()
            .order_by(AccountCrossingModel.proveedor_nombre.asc())
            .all()
        )
        return [r[0] for r in rows if r[0]]

    def get_crossing(self, crossing_id: int) -> dict | None:
        crossing = self.crossing_repo.get_by_id(crossing_id)
        if not crossing:
            return None
        data = self.to_dict(crossing, crossing.document)
        data["remediations"] = [
            {
                "id": r.id,
                "tipo_problema": r.tipo_problema,
                "descripcion": r.descripcion,
                "estado": r.estado,
                "valor_involucrado": r.valor_involucrado,
            }
            for r in crossing.remediations
        ]
        return data

    def approve(self, crossing_id: int, usuario: str = "ANDREA") -> dict:
        crossing = self.crossing_repo.get_by_id(crossing_id)
        if not crossing:
            raise CrossingServiceError("Cruce no encontrado.", "NOT_FOUND")

        self.crossing_repo.update_estado(
            crossing,
            CrossingStatus.APROBADO,
            approved_by=usuario,
        )
        if crossing.document:
            crossing.document.estado = DocumentStatus.APROBADO

        self.audit.log(
            "CRUCE_APROBADO",
            "AccountCrossing",
            str(crossing_id),
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(crossing)
        return self.to_dict(crossing, crossing.document)

    def approve_all_in_revision(self, usuario: str = "ANDREA") -> dict:
        """Aprueba en lote todos los cruces EN_REVISION (acción rápida para la jefa)."""
        items, _ = self.crossing_repo.list_crossings(
            limit=500,
            offset=0,
            estado=CrossingStatus.EN_REVISION,
        )
        approved = 0
        for crossing in items:
            self.crossing_repo.update_estado(
                crossing,
                CrossingStatus.APROBADO,
                approved_by=usuario,
            )
            if crossing.document:
                crossing.document.estado = DocumentStatus.APROBADO
            approved += 1
        if approved:
            self.audit.log(
                "CRUCE_APROBADO_LOTE",
                "AccountCrossing",
                "batch",
                valor_nuevo=f"{approved} aprobados",
                usuario=usuario,
            )
            self.db.commit()
        return {"approved": approved}

    def reject(self, crossing_id: int, motivo: str, usuario: str = "ANDREA") -> dict:
        crossing = self.crossing_repo.get_by_id(crossing_id)
        if not crossing:
            raise CrossingServiceError("Cruce no encontrado.", "NOT_FOUND")

        obs = crossing.observaciones or ""
        if motivo:
            obs = f"{obs}; Rechazado: {motivo}".strip("; ")

        self.crossing_repo.update_estado(
            crossing,
            CrossingStatus.SUBSANACION,
            observaciones=obs,
        )
        if crossing.document:
            crossing.document.estado = DocumentStatus.SUBSANACION

        if crossing.document_id:
            self.crossing_repo.create_remediation(
                document_id=crossing.document_id,
                crossing_id=crossing.id,
                proveedor=crossing.proveedor_nombre,
                tipo_problema=RemediationType.OTRO,
                descripcion=motivo or "Cruce rechazado por revisión humana.",
                valor_involucrado=crossing.diferencia,
            )

        self.audit.log(
            "CRUCE_RECHAZADO",
            "AccountCrossing",
            str(crossing_id),
            valor_nuevo=motivo,
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(crossing)
        return self.to_dict(crossing, crossing.document)

    def manual_link(
        self,
        crossing_id: int,
        autobits_record_id: int,
        usuario: str = "ANDREA",
    ) -> dict:
        crossing = self.crossing_repo.get_by_id(crossing_id)
        record = self.autobits_repo.get_record(autobits_record_id)
        if not crossing or not record:
            raise CrossingServiceError("Cruce o registro Autobits no encontrado.", "NOT_FOUND")

        doc = crossing.document
        if not doc:
            raise CrossingServiceError("Documento del cruce no encontrado.", "NOT_FOUND")
        ctx = extract_document_context(doc)
        candidate = self.matcher.score_pair(ctx, record)
        candidate.match_type = MatchType.MATCH_PROBABLE

        estado, remediation_types, obs = self.rules.evaluate_crossing(ctx, candidate, record.nit)

        crossing.autobits_record_id = record.id
        crossing.match_type = candidate.match_type
        crossing.match_score = candidate.score
        crossing.estado = CrossingStatus.EN_REVISION
        crossing.valor_autobits = candidate.valor_autobits
        crossing.diferencia = candidate.diferencia
        crossing.numero_compra = candidate.numero_compra
        crossing.numero_reserva = candidate.numero_reserva
        crossing.proveedor_nombre = candidate.proveedor
        crossing.observaciones = "; ".join(obs) if obs else "Vinculación manual."
        crossing.match_reasons = json.dumps(["manual"] + candidate.reasons, ensure_ascii=False)
        self.db.flush()

        self.audit.log(
            "CRUCE_MANUAL",
            "AccountCrossing",
            str(crossing_id),
            valor_nuevo=str(autobits_record_id),
            usuario=usuario,
        )
        self.db.commit()
        self.db.refresh(crossing)
        return self.to_dict(crossing, crossing.document)

    def to_dict(self, crossing: AccountCrossingModel, doc: DocumentModel | None) -> dict:
        doc_filename = doc.filename if doc else None
        doc_numero = doc.numero_documento if doc else None
        doc_estado = doc.estado if doc else None
        return {
            "id": crossing.id,
            "document_id": crossing.document_id,
            "document_filename": doc_filename,
            "document_numero": doc_numero,
            "document_estado": doc_estado,
            "autobits_record_id": crossing.autobits_record_id,
            "import_batch_id": crossing.import_batch_id,
            "match_type": crossing.match_type,
            "match_score": crossing.match_score,
            "estado": crossing.estado,
            "proveedor": crossing.proveedor_nombre,
            "nit": crossing.nit,
            "numero_compra": crossing.numero_compra,
            "numero_reserva": crossing.numero_reserva,
            "fecha_ejecucion": crossing.fecha_ejecucion,
            "concepto": crossing.concepto,
            "valor_documento": crossing.valor_documento,
            "valor_autobits": crossing.valor_autobits,
            "diferencia": crossing.diferencia,
            "factura_cdc": crossing.factura_cdc,
            "fecha_pago": crossing.fecha_pago,
            "observaciones": crossing.observaciones,
            "match_reasons": json.loads(crossing.match_reasons) if crossing.match_reasons else [],
            "approved_by": crossing.approved_by,
            "approved_at": crossing.approved_at.isoformat() if crossing.approved_at else None,
            "created_at": crossing.created_at.isoformat() if crossing.created_at else "",
        }
