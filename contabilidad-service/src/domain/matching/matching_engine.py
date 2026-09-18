"""Motor de matching documento ↔ Autobits."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field

from domain.enums import MatchType
from domain.matching.normalize import (
    date_proximity,
    invoice_numbers_match,
    names_similar,
    nits_match,
    normalize_id,
    value_difference,
    values_close,
)
from domain.utils.money import money_to_float
from infrastructure.persistence.models import AutobitsRecordModel, CruceRecordModel, DocumentModel


@dataclass
class MatchCandidate:
    autobits_record_id: int
    score: float
    match_type: str
    reasons: list[str] = field(default_factory=list)
    valor_documento: float | None = None
    valor_autobits: float | None = None
    diferencia: float | None = None
    numero_compra: str | None = None
    numero_reserva: str | None = None
    proveedor: str | None = None
    cruce_record_id: int | None = None
    factura_cdc: str | None = None


@dataclass
class DocumentMatchContext:
    numero_documento: str | None
    nit: str | None
    proveedor: str | None
    compra: str | None
    reserva: str | None
    valor: float | None
    fecha: str | None


def extract_document_context(doc: DocumentModel) -> DocumentMatchContext:
    compra = None
    reserva = None
    numero = doc.numero_documento
    nit = doc.provider.nit if doc.provider else None
    proveedor = doc.provider.nombre if doc.provider else None
    valor = doc.total
    fecha = doc.fecha_emision
    if doc.extracted_json:
        try:
            data = json.loads(doc.extracted_json)
        except json.JSONDecodeError:
            data = {}
        if isinstance(data, dict):
            compra = data.get("compra") or _nested(data, "documento", "compra")
            reserva = data.get("reserva") or _nested(data, "documento", "reserva")
            if isinstance(compra, dict):
                compra = compra.get("numero") or compra.get("com")
            if isinstance(reserva, dict):
                reserva = reserva.get("numero")
            numero = (
                numero
                or data.get("numero_factura")
                or data.get("numero_documento")
                or _nested(data, "documento", "numero")
                or _nested(data, "documento", "numero_factura")
            )
            nit = (
                nit
                or data.get("nit_o_identificacion")
                or data.get("nit")
                or _nested(data, "proveedor", "nit")
            )
            if not proveedor:
                p = data.get("proveedor")
                proveedor = p.get("nombre") if isinstance(p, dict) else p
            if valor is None:
                valor = data.get("total") or _nested(data, "documento", "total")
            fecha = (
                fecha
                or data.get("fecha_emision")
                or _nested(data, "documento", "fecha_emision")
                or _nested(data, "documento", "fecha")
            )

    return DocumentMatchContext(
        numero_documento=str(numero).strip() if numero else None,
        nit=str(nit).strip() if nit else None,
        proveedor=str(proveedor).strip() if proveedor else None,
        compra=str(compra).strip() if compra else None,
        reserva=str(reserva).strip() if reserva else None,
        valor=money_to_float(valor),
        fecha=str(fecha).strip() if fecha else None,
    )


def _nested(data: dict, *keys: str):
    cur = data
    for key in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


class MatchingEngine:
    """Cruza factura ↔ fila Autobits con todos los datos disponibles.

    El número de factura es el ancla más fuerte cuando el Excel lo trae.
    Si no, combina NIT, valor, fecha, proveedor, COM y reserva.
    """

    EXACT_THRESHOLD = 85.0
    PROBABLE_THRESHOLD = 50.0
    AMBIGUITY_GAP = 8.0

    def find_best_match(
        self,
        doc: DocumentModel,
        records: list[AutobitsRecordModel],
    ) -> MatchCandidate | None:
        if not records:
            return None

        ctx = extract_document_context(doc)
        scored: list[MatchCandidate] = []
        for record in records:
            candidate = self.score_pair(ctx, record)
            if candidate.score > 0:
                scored.append(candidate)

        if not scored:
            return None

        scored.sort(key=self._rank_key, reverse=True)
        best = scored[0]
        if not self.is_acceptable(best):
            return None
        self._flag_ambiguity(best, scored)
        return best

    def assign_best_matches(
        self,
        documents: list[DocumentModel],
        records: list[AutobitsRecordModel],
    ) -> dict[int, MatchCandidate]:
        """Asignación 1:1: el mejor puntaje global primero, cada fila y factura una sola vez."""
        pairs: list[tuple[tuple, int, int, MatchCandidate]] = []
        for doc in documents:
            if not getattr(doc, "id", None):
                continue
            ctx = extract_document_context(doc)
            for record in records:
                if not getattr(record, "id", None):
                    continue
                cand = self.score_pair(ctx, record)
                if not self.is_acceptable(cand):
                    continue
                pairs.append((self._rank_key(cand), doc.id, record.id, cand))

        pairs.sort(key=lambda row: row[0], reverse=True)
        used_docs: set[int] = set()
        used_recs: set[int] = set()
        assigned: dict[int, MatchCandidate] = {}
        for _rank, doc_id, rec_id, cand in pairs:
            if doc_id in used_docs or rec_id in used_recs:
                continue
            used_docs.add(doc_id)
            used_recs.add(rec_id)
            assigned[doc_id] = cand
        return assigned

    @staticmethod
    def _rank_key(cand: MatchCandidate) -> tuple:
        """Prioriza ancla única (factura/COM), luego puntaje, luego menor diferencia de valor."""
        if "documento_exacto" in cand.reasons or "factura_cdc" in cand.reasons:
            strong = 2
        elif "compra_exacta" in cand.reasons:
            strong = 1
        else:
            strong = 0
        diff = abs(cand.diferencia) if cand.diferencia is not None else 10**12
        try:
            diff = float(diff)
        except (TypeError, ValueError, OverflowError):
            diff = 10**12
        if not math.isfinite(diff):
            diff = 10**12
        try:
            score = float(cand.score or 0)
        except (TypeError, ValueError, OverflowError):
            score = 0.0
        if not math.isfinite(score):
            score = 0.0
        return (strong, score, -diff)

    def is_acceptable(self, cand: MatchCandidate) -> bool:
        """No cruzar con un solo dato débil: hace falta identidad o combinación."""
        reasons = set(cand.reasons)
        if "documento_exacto" in reasons or "compra_exacta" in reasons:
            return True
        if "nit" in reasons and ("valor" in reasons or "valor_cercano" in reasons):
            return True
        if "nit" in reasons and ("fecha" in reasons or "fecha_cercana" in reasons):
            return True
        if "proveedor" in reasons and "valor" in reasons and (
            "fecha" in reasons or "fecha_cercana" in reasons or "nit" in reasons
        ):
            return True
        if cand.score >= self.PROBABLE_THRESHOLD and len(reasons) >= 2:
            return True
        return False

    def score_pair(
        self,
        ctx: DocumentMatchContext,
        record: AutobitsRecordModel,
    ) -> MatchCandidate:
        score = 0.0
        reasons: list[str] = []

        doc_compra = ctx.compra
        doc_num = ctx.numero_documento

        from domain.autobits.fields import (
            com_from_excel_record,
            com_from_value,
            excel_compra_reserva,
            excel_factura_proveedor,
            excel_fecha,
            excel_nit,
        )

        excel_oc, excel_reserva = excel_compra_reserva(record)
        excel_com = com_from_excel_record(record)
        excel_factura = excel_factura_proveedor(record)
        rec_nit = excel_nit(record) or record.nit
        rec_fecha = excel_fecha(record) or record.fecha
        rec_valor = record.valor

        # 1) Número de factura (Codigo Factura proveedor): ancla 1:1.
        if doc_num and excel_factura and invoice_numbers_match(doc_num, excel_factura):
            score += 90
            reasons.append("documento_exacto")
        elif doc_num and record.numero_documento and invoice_numbers_match(doc_num, record.numero_documento):
            score += 90
            reasons.append("documento_exacto")

        # 2) COM / orden de compra impresa en la factura (nunca el n° de factura).
        doc_com = com_from_value(doc_compra)
        if doc_com and excel_com and normalize_id(doc_com) == normalize_id(excel_com):
            score += 70
            reasons.append("compra_exacta")
        elif doc_compra and excel_com and normalize_id(doc_compra) == normalize_id(excel_com):
            score += 70
            reasons.append("compra_exacta")
        elif doc_compra and excel_oc and normalize_id(doc_compra) == normalize_id(excel_oc):
            score += 55
            reasons.append("compra_exacta")

        if ctx.nit and rec_nit and nits_match(ctx.nit, rec_nit):
            score += 32
            reasons.append("nit")

        if names_similar(ctx.proveedor, record.proveedor):
            score += 18
            reasons.append("proveedor")

        if ctx.reserva and (excel_reserva or record.numero_reserva):
            if normalize_id(ctx.reserva) == normalize_id(excel_reserva or record.numero_reserva):
                score += 12
                reasons.append("reserva")

        if values_close(ctx.valor, rec_valor, tolerance_pct=1.0):
            score += 28
            reasons.append("valor")
        elif ctx.valor is not None and rec_valor is not None and values_close(
            ctx.valor, rec_valor, tolerance_pct=5.0
        ):
            score += 12
            reasons.append("valor_cercano")

        pts_fecha, reason_fecha = date_proximity(ctx.fecha, rec_fecha)
        if pts_fecha:
            score += pts_fecha
            reasons.append(reason_fecha or "fecha")

        # Bonos de combinación: Excel sin número de factura (NIT + valor es el caso típico).
        if "nit" in reasons and "valor" in reasons:
            score += 10
        elif "nit" in reasons and reason_fecha in ("fecha", "fecha_cercana"):
            score += 8
        elif "proveedor" in reasons and "valor" in reasons:
            score += 6

        if score > 100:
            score = 100.0

        match_type = self.classify(score, reasons)
        diferencia = money_to_float(value_difference(ctx.valor, rec_valor))

        return MatchCandidate(
            autobits_record_id=record.id,
            score=round(score, 1),
            match_type=match_type,
            reasons=reasons,
            valor_documento=money_to_float(ctx.valor),
            valor_autobits=money_to_float(rec_valor),
            diferencia=diferencia,
            numero_compra=excel_com,
            numero_reserva=excel_reserva or record.numero_reserva,
            proveedor=record.proveedor or ctx.proveedor,
        )

    def find_best_cruce_match(
        self,
        doc: DocumentModel,
        records: list[CruceRecordModel],
    ) -> MatchCandidate | None:
        """Mejor fila del Excel de Cruce de Cuentas para esta factura."""
        if not records:
            return None
        ctx = extract_document_context(doc)
        scored: list[MatchCandidate] = []
        for record in records:
            candidate = self.score_cruce_pair(ctx, record)
            if candidate.score > 0:
                scored.append(candidate)
        if not scored:
            return None
        scored.sort(key=lambda c: c.score, reverse=True)
        best = scored[0]
        if not self.is_acceptable(best) and best.score < self.PROBABLE_THRESHOLD:
            return None
        self._flag_ambiguity(best, scored)
        return best

    def score_cruce_pair(
        self,
        ctx: DocumentMatchContext,
        record: CruceRecordModel,
    ) -> MatchCandidate:
        score = 0.0
        reasons: list[str] = []
        doc_compra = ctx.compra
        doc_num = ctx.numero_documento

        if doc_num and record.factura_cdc and invoice_numbers_match(doc_num, record.factura_cdc):
            score += 90
            reasons.append("factura_cdc")
        if doc_compra and record.numero_compra and normalize_id(doc_compra) == normalize_id(record.numero_compra):
            score += 70
            reasons.append("compra_exacta")
        elif doc_num and record.numero_compra and invoice_numbers_match(doc_num, record.numero_compra):
            score += 30
            reasons.append("doc_compra_cruzado")

        if ctx.nit and record.nit and nits_match(ctx.nit, record.nit):
            score += 32
            reasons.append("nit")
        if names_similar(ctx.proveedor, record.proveedor):
            score += 18
            reasons.append("proveedor")
        if ctx.reserva and record.numero_reserva and normalize_id(ctx.reserva) == normalize_id(record.numero_reserva):
            score += 12
            reasons.append("reserva")
        if values_close(ctx.valor, record.valor):
            score += 28
            reasons.append("valor")
        elif ctx.valor and record.valor and values_close(ctx.valor, record.valor, tolerance_pct=5.0):
            score += 12
            reasons.append("valor_cercano")
        pts_fecha, reason_fecha = date_proximity(ctx.fecha, record.fecha_ejecucion)
        if pts_fecha:
            score += pts_fecha
            reasons.append(reason_fecha or "fecha")
        if "nit" in reasons and "valor" in reasons:
            score += 10

        if score > 100:
            score = 100.0
        match_type = self.classify(score, reasons)
        diferencia = money_to_float(value_difference(ctx.valor, record.valor))
        return MatchCandidate(
            autobits_record_id=0,
            cruce_record_id=record.id,
            score=round(score, 1),
            match_type=match_type,
            reasons=reasons,
            valor_documento=money_to_float(ctx.valor),
            valor_autobits=money_to_float(record.valor),
            diferencia=diferencia,
            numero_compra=record.numero_compra,
            numero_reserva=record.numero_reserva,
            proveedor=record.proveedor or ctx.proveedor,
            factura_cdc=record.factura_cdc,
        )

    def _flag_ambiguity(self, best: MatchCandidate, scored: list[MatchCandidate]) -> None:
        """Si hay dos candidatos casi empatados sin ancla única, marcar revisión."""
        if len(scored) < 2:
            return
        if "documento_exacto" in best.reasons or "compra_exacta" in best.reasons:
            return
        second = scored[1]
        if not self.is_acceptable(second):
            return
        if best.score - second.score >= self.AMBIGUITY_GAP:
            return
        if "ambiguo" not in best.reasons:
            best.reasons.append("ambiguo")
        best.match_type = MatchType.MATCH_PROBABLE

    def classify(self, score: float, reasons: list[str]) -> str:
        has_strong_id = any(
            r in reasons
            for r in ("compra_exacta", "documento_exacto", "doc_compra_cruzado", "factura_cdc")
        )
        has_identity = "nit" in reasons or "proveedor" in reasons

        # EXACTO solo con ancla única (factura/COM). NIT+valor es probable aunque sume 100.
        if score >= self.EXACT_THRESHOLD and has_strong_id and has_identity:
            return MatchType.MATCH_EXACTO
        if self.is_acceptable(
            MatchCandidate(autobits_record_id=0, score=score, match_type="", reasons=reasons)
        ):
            return MatchType.MATCH_PROBABLE
        if score >= self.PROBABLE_THRESHOLD:
            return MatchType.MATCH_PROBABLE
        return MatchType.SIN_MATCH

    def build_sin_match(self, doc: DocumentModel) -> MatchCandidate:
        ctx = extract_document_context(doc)
        return MatchCandidate(
            autobits_record_id=0,
            score=0.0,
            match_type=MatchType.SIN_MATCH,
            reasons=["sin_candidato"],
            valor_documento=ctx.valor,
            valor_autobits=None,
            diferencia=None,
            numero_compra=ctx.compra,
            numero_reserva=ctx.reserva,
            proveedor=ctx.proveedor,
        )
