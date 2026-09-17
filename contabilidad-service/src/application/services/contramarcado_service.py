"""Orquesta contramarcado automático post-análisis de factura."""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from domain.matching.matching_engine import MatchingEngine, extract_document_context
from domain.services.contramarcado import (
    SOURCE_AUTOBITS,
    SOURCE_CROSSING,
    ComCandidate,
    ContramarcadoResult,
    build_contramarcado,
    normalize_com,
)
from infrastructure.persistence.models import DocumentModel
from infrastructure.persistence.repositories import (
    AutobitsRepository,
    CrossingRepository,
    DocumentRepository,
)

logger = logging.getLogger(__name__)


class ContramarcadoService:
    def __init__(self, db: Session):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.autobits_repo = AutobitsRepository(db)
        self.crossing_repo = CrossingRepository(db)
        self.matcher = MatchingEngine()

    def apply_for_document(
        self,
        document: DocumentModel,
        *,
        batch_id: int | None = None,
        extracted: dict | None = None,
        ocr_text: str | None = None,
        commit: bool = False,
        exclude_record_ids: set[int] | None = None,
        exclude_coms: set[str] | None = None,
    ) -> ContramarcadoResult:
        """Calcula y persiste el contramarcado para un documento ya analizado."""
        data = extracted
        if data is None and document.extracted_json:
            try:
                data = json.loads(document.extracted_json)
            except json.JSONDecodeError:
                data = {}
        data = dict(data or {})

        proveedor = None
        if document.provider:
            proveedor = document.provider.nombre
        if not proveedor:
            p = data.get("proveedor")
            proveedor = p.get("nombre") if isinstance(p, dict) else p

        numero = document.numero_documento or data.get("numero_factura")
        if isinstance(data.get("documento"), dict):
            numero = numero or data["documento"].get("numero")

        tipo = document.tipo or data.get("tipo_documento")
        fecha = document.fecha_emision or data.get("fecha_emision")
        total = document.total if document.total is not None else data.get("total")
        text = ocr_text if ocr_text is not None else document.ocr_text

        # Si ya hay cruce 1:1 con COM, no reabrir matching fuzzy del lote completo
        # (eso es lo que descuadraba «Volver a analizar facturas»).
        crossing_cands = self._crossing_candidates(document)
        if crossing_cands:
            candidates = list(crossing_cands)
        else:
            candidates = self._autobits_candidates(
                document,
                batch_id=batch_id,
                exclude_record_ids=exclude_record_ids,
                exclude_coms=exclude_coms,
            )

        result = build_contramarcado(
            fecha_emision=fecha,
            tipo_documento=tipo,
            numero_factura=numero,
            proveedor=proveedor,
            total=total,
            extracted=data,
            ocr_text=text,
            autobits_candidates=candidates,
        )

        # Persistir en extracted_json + columnas densas
        data.update(result.persist_fields())
        document.extracted_json = json.dumps(data, ensure_ascii=False)
        document.contramarcado = result.value
        document.contramarcado_status = result.status
        document.contramarcado_com = result.com
        document.contramarcado_source = result.source
        document.contramarcado_confidence = result.confidence

        if result.status in ("PENDIENTE", "AMBIGUO") and result.warning:
            # No pisar observaciones de OCR; anexar aviso corto si falta
            note = result.warning
            if document.observaciones and note not in document.observaciones:
                document.observaciones = f"{document.observaciones}; {note}"
            elif not document.observaciones:
                document.observaciones = note
            if result.status == "AMBIGUO":
                document.requiere_revision = True

        self.db.flush()
        if commit:
            self.db.commit()

        logger.info(
            "Contramarcado doc=%s status=%s source=%s com=%s",
            document.id,
            result.status,
            result.source,
            result.com,
        )
        return result

    def apply_for_documents(
        self,
        documents: list[DocumentModel],
        *,
        batch_id: int | None = None,
    ) -> int:
        """Aplica contramarcado con consumo exclusivo de filas Autobits (1 factura → 1 COM)."""
        used_record_ids: set[int] = set()
        used_coms: set[str] = set()
        count = 0
        for doc in documents:
            if not doc.extracted_json and not doc.numero_documento:
                continue
            try:
                result = self.apply_for_document(
                    doc,
                    batch_id=batch_id,
                    exclude_record_ids=used_record_ids,
                    exclude_coms=used_coms,
                )
                count += 1
                if result.record_id:
                    used_record_ids.add(int(result.record_id))
                if result.com and result.source in (SOURCE_AUTOBITS, SOURCE_CROSSING):
                    used_coms.add(result.com)
            except Exception:  # noqa: BLE001
                logger.exception("Fallo contramarcado doc=%s", getattr(doc, "id", None))
        return count

    def clear_for_documents(self, documents: list[DocumentModel]) -> int:
        """Borra contramarcado previo para forzar un reanálisis limpio."""
        cleared = 0
        for doc in documents:
            had = bool(
                doc.contramarcado
                or doc.contramarcado_com
                or doc.contramarcado_status
                or doc.contramarcado_source
            )
            doc.contramarcado = None
            doc.contramarcado_status = None
            doc.contramarcado_com = None
            doc.contramarcado_source = None
            doc.contramarcado_confidence = None
            if doc.extracted_json:
                try:
                    data = json.loads(doc.extracted_json)
                except json.JSONDecodeError:
                    data = None
                if isinstance(data, dict):
                    for key in (
                        "contramarcado",
                        "contramarcadoStatus",
                        "contramarcadoCom",
                        "contramarcadoSource",
                        "contramarcadoConfidence",
                        "contramarcadoWarning",
                        "contramarcadoCandidates",
                        "_contramarcado",
                    ):
                        data.pop(key, None)
                    doc.extracted_json = json.dumps(data, ensure_ascii=False)
            if had:
                cleared += 1
        self.db.flush()
        return cleared

    @staticmethod
    def needs_com_retry(document: DocumentModel) -> bool:
        """True si aún no tiene un COM resuelto (número de compra)."""
        return normalize_com(getattr(document, "contramarcado_com", None)) is None

    def apply_missing_for_documents(
        self,
        documents: list[DocumentModel],
        *,
        batch_id: int | None = None,
    ) -> tuple[int, int, list[dict]]:
        """Recontramarca solo documentos sin COM. Retorna (updated, skipped, items)."""
        used_record_ids: set[int] = set()
        used_coms: set[str] = set()
        # Reservar COM ya asignados en la carpeta para no reutilizarlos
        for doc in documents:
            com = normalize_com(getattr(doc, "contramarcado_com", None))
            if com:
                used_coms.add(com)

        updated = 0
        skipped = 0
        items: list[dict] = []
        for doc in documents:
            if not doc.extracted_json and not doc.numero_documento:
                skipped += 1
                continue
            if not self.needs_com_retry(doc):
                skipped += 1
                continue
            try:
                result = self.apply_for_document(
                    doc,
                    batch_id=batch_id,
                    exclude_record_ids=used_record_ids,
                    exclude_coms=used_coms,
                )
                updated += 1
                if result.record_id:
                    used_record_ids.add(int(result.record_id))
                if result.com and result.source in (SOURCE_AUTOBITS, SOURCE_CROSSING):
                    used_coms.add(result.com)
                items.append(
                    {
                        "id": doc.id,
                        "status": result.status,
                        "com": result.com,
                        "value": result.value,
                        "source": result.source,
                    }
                )
            except Exception:  # noqa: BLE001
                logger.exception("Fallo re-contramarcado doc=%s", getattr(doc, "id", None))
                skipped += 1
        return updated, skipped, items

    def _crossing_candidates(self, document: DocumentModel) -> list[ComCandidate]:
        out: list[ComCandidate] = []
        crossings: list = []
        try:
            one = self.crossing_repo.get_for_document(document.id)
            if one:
                crossings = [one]
            active = self.crossing_repo.get_active_for_document(document.id)
            if active and active not in crossings:
                crossings.append(active)
        except Exception:  # noqa: BLE001
            crossings = list(getattr(document, "crossings", None) or [])
        for x in crossings:
            com = normalize_com(getattr(x, "numero_compra", None))
            if not com:
                continue
            out.append(
                ComCandidate(
                    com=com,
                    source=SOURCE_CROSSING,
                    score=100.0,
                    reasons=["crossing_existente"],
                    proveedor=getattr(x, "proveedor_nombre", None),
                    numero_documento=document.numero_documento,
                    record_id=getattr(x, "autobits_record_id", None),
                )
            )
        return out

    def _autobits_candidates(
        self,
        document: DocumentModel,
        *,
        batch_id: int | None = None,
        exclude_record_ids: set[int] | None = None,
        exclude_coms: set[str] | None = None,
    ) -> list[ComCandidate]:
        if batch_id:
            records = self.autobits_repo.list_records_for_batch(batch_id)
        else:
            # Preferir batch del folder si existe; si no, todos
            records = self.autobits_repo.list_all_records()

        if not records:
            return []

        blocked_ids = exclude_record_ids or set()
        blocked_coms = exclude_coms or set()
        ctx = extract_document_context(document)
        out: list[ComCandidate] = []
        for record in records:
            if record.id in blocked_ids:
                continue
            raw_compra = (record.numero_compra or "").strip()
            com = normalize_com(raw_compra)
            if not com and raw_compra:
                # Autobits a veces trae OC sin prefijo COM; usarla igual como candidato
                digits = "".join(ch for ch in raw_compra if ch.isdigit())
                if len(digits) >= 4:
                    com = normalize_com(digits) or raw_compra.upper().replace(" ", "")
                elif len(raw_compra) >= 3:
                    com = raw_compra.upper().replace(" ", "")
            if not com:
                continue
            if com in blocked_coms:
                continue
            scored = self.matcher.score_pair(ctx, record)
            # Refuerzo: coincidencia exacta de número de factura / referencia
            reasons = list(scored.reasons)
            score = scored.score
            if document.numero_documento and record.numero_documento:
                from domain.matching.normalize import normalize_id

                if normalize_id(document.numero_documento) == normalize_id(record.numero_documento):
                    if "documento_exacto" not in reasons:
                        score = max(score, 85.0)
                        reasons.append("documento_exacto")
            if score <= 0:
                continue
            # Misma regla de ambigüedad que CrossingService: no anclar en silencio
            # si hay otro candidato casi igual de fuerte con otro COM.
            out.append(
                ComCandidate(
                    com=com,
                    source=SOURCE_AUTOBITS,
                    score=score,
                    reasons=reasons,
                    proveedor=record.proveedor,
                    numero_documento=record.numero_documento,
                    record_id=record.id,
                )
            )
        return out
