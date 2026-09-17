"""Orquesta contramarcado automático post-análisis de factura."""

from __future__ import annotations

import json
import logging

from sqlalchemy.orm import Session

from domain.autobits.fields import com_from_excel_record, com_from_value, looks_like_invoice_code
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

_LOCKED_SOURCES = frozenset({SOURCE_AUTOBITS, SOURCE_CROSSING, "INVOICE"})


class ContramarcadoService:
    def __init__(self, db: Session):
        self.db = db
        self.doc_repo = DocumentRepository(db)
        self.autobits_repo = AutobitsRepository(db)
        self.crossing_repo = CrossingRepository(db)
        self.matcher = MatchingEngine()

    def locked_com_for_document(
        self,
        document: DocumentModel,
        *,
        excel_com_only: bool = False,
    ) -> tuple[str | None, str | None, int | None]:
        """COM desde cruce / Excel Autobits.

        Si excel_com_only=True ignora el COM viejo del documento (puede estar mal)
        y solo usa el de la fila Autobits/cruce.
        """
        from domain.autobits.fields import com_from_excel_record, looks_like_invoice_code

        for x in self._crossing_rows(document):
            rid = getattr(x, "autobits_record_id", None)
            if rid:
                record = self.autobits_repo.get_record(int(rid))
                if record:
                    com = com_from_excel_record(record)
                    if com and not looks_like_invoice_code(com):
                        return com, SOURCE_CROSSING, int(rid)
            com = com_from_value(getattr(x, "numero_compra", None))
            if com:
                return com, SOURCE_CROSSING, rid
        if excel_com_only:
            return None, None, None
        existing = com_from_value(getattr(document, "contramarcado_com", None))
        if existing:
            source = (getattr(document, "contramarcado_source", None) or "").upper() or SOURCE_CROSSING
            return existing, source, None
        return None, None, None

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
        preserve_locked_com: bool = True,
        excel_com_only: bool = False,
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

        locked_com, locked_source, locked_record_id = (None, None, None)
        if preserve_locked_com or excel_com_only:
            locked_com, locked_source, locked_record_id = self.locked_com_for_document(
                document, excel_com_only=excel_com_only
            )

        if locked_com:
            candidates = [
                ComCandidate(
                    com=locked_com,
                    source=locked_source or SOURCE_CROSSING,
                    score=100.0,
                    reasons=["com_excel_autobits"],
                    proveedor=proveedor,
                    numero_documento=numero,
                    record_id=locked_record_id,
                )
            ]
        else:
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

        # Si había COM bloqueado, forzar que no lo cambie un OCR falso.
        if locked_com and result.com != locked_com:
            from domain.services.contramarcado import (
                STATUS_GENERADO,
                build_contramarcado_string,
                format_fecha_ddmmyyyy,
                format_valor_tag,
                normalize_empresa,
                normalize_tipo_documento,
            )

            fecha_fmt = format_fecha_ddmmyyyy(fecha)
            tipo_n = normalize_tipo_documento(tipo)
            empresa = normalize_empresa(proveedor)
            valor_tag = format_valor_tag(total)
            value = build_contramarcado_string(
                fecha_ddmmyyyy=fecha_fmt,
                tipo=tipo_n,
                numero=(numero or "").strip() or None,
                empresa=empresa,
                valor_tag=valor_tag,
                com=locked_com,
            )
            result = ContramarcadoResult(
                value=value,
                status=STATUS_GENERADO,
                com=locked_com,
                source=locked_source or SOURCE_CROSSING,
                confidence=1.0,
                warning=None,
                candidates=result.candidates,
                tipo=tipo_n,
                numero=(numero or "").strip() or None,
                empresa=empresa,
                fecha_ddmmyyyy=fecha_fmt,
                valor_tag=valor_tag,
                record_id=locked_record_id,
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
            "Contramarcado doc=%s status=%s source=%s com=%s locked=%s",
            document.id,
            result.status,
            result.source,
            result.com,
            bool(locked_com),
        )
        return result

    def apply_for_documents(
        self,
        documents: list[DocumentModel],
        *,
        batch_id: int | None = None,
        preserve_locked_com: bool = True,
        excel_com_only: bool = False,
    ) -> int:
        """Aplica contramarcado. Con excel_com_only toma COM solo del Excel/cruce."""
        used_record_ids: set[int] = set()
        used_coms: set[str] = set()
        for doc in documents:
            locked, _, rid = self.locked_com_for_document(doc, excel_com_only=excel_com_only)
            if locked:
                used_coms.add(locked)
            if rid:
                used_record_ids.add(int(rid))

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
                    preserve_locked_com=preserve_locked_com,
                    excel_com_only=excel_com_only,
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
        """Borra contramarcado previo. No tocar si quieres conservar el COM del Excel."""
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
        """Recontramarca solo documentos sin COM. Los que ya tienen COM del Excel no se tocan."""
        used_record_ids: set[int] = set()
        used_coms: set[str] = set()
        for doc in documents:
            locked, _, rid = self.locked_com_for_document(doc)
            if locked:
                used_coms.add(locked)
            if rid:
                used_record_ids.add(int(rid))
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
                # Ya tiene COM: regenerar texto sin cambiar el código.
                try:
                    result = self.apply_for_document(
                        doc,
                        batch_id=batch_id,
                        preserve_locked_com=True,
                    )
                    updated += 1
                    items.append(
                        {
                            "id": doc.id,
                            "status": result.status,
                            "com": result.com,
                            "value": result.value,
                            "source": result.source,
                            "preserved": True,
                        }
                    )
                except Exception:  # noqa: BLE001
                    logger.exception("Fallo rebuild COM bloqueado doc=%s", getattr(doc, "id", None))
                    skipped += 1
                continue
            try:
                result = self.apply_for_document(
                    doc,
                    batch_id=batch_id,
                    exclude_record_ids=used_record_ids,
                    exclude_coms=used_coms,
                    preserve_locked_com=True,
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
                        "preserved": False,
                    }
                )
            except Exception:  # noqa: BLE001
                logger.exception("Fallo re-contramarcado doc=%s", getattr(doc, "id", None))
                skipped += 1
        return updated, skipped, items

    def _crossing_rows(self, document: DocumentModel) -> list:
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
        return crossings

    def _crossing_candidates(self, document: DocumentModel) -> list[ComCandidate]:
        out: list[ComCandidate] = []
        for x in self._crossing_rows(document):
            com = None
            rid = getattr(x, "autobits_record_id", None)
            if rid:
                record = self.autobits_repo.get_record(int(rid))
                if record:
                    com = com_from_excel_record(record)
            if not com:
                com = com_from_value(getattr(x, "numero_compra", None))
            if not com or looks_like_invoice_code(com):
                continue
            out.append(
                ComCandidate(
                    com=com,
                    source=SOURCE_CROSSING,
                    score=100.0,
                    reasons=["crossing_excel"],
                    proveedor=getattr(x, "proveedor_nombre", None),
                    numero_documento=document.numero_documento,
                    record_id=rid,
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
            records = self.autobits_repo.list_all_records()

        if not records:
            return []

        blocked_ids = exclude_record_ids or set()
        blocked_coms = exclude_coms or set()
        invoice_no = (document.numero_documento or "").strip().upper()
        ctx = extract_document_context(document)
        out: list[ComCandidate] = []
        for record in records:
            if record.id in blocked_ids:
                continue
            com = com_from_excel_record(record)
            if not com or looks_like_invoice_code(com):
                continue
            if invoice_no and com.replace(" ", "") == invoice_no.replace(" ", "").replace("-", ""):
                continue
            if com in blocked_coms:
                continue
            scored = self.matcher.score_pair(ctx, record)
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
