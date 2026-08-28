"""Motor de matching documento ↔ Autobits."""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from domain.enums import MatchType
from domain.matching.normalize import (
    names_similar,
    normalize_id,
    normalize_nit,
    values_close,
)
from infrastructure.persistence.models import AutobitsRecordModel, DocumentModel


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
    if doc.extracted_json:
        try:
            data = json.loads(doc.extracted_json)
            compra = data.get("compra") or _nested(data, "documento", "compra")
            reserva = data.get("reserva") or _nested(data, "documento", "reserva")
            if isinstance(compra, dict):
                compra = compra.get("numero")
            if isinstance(reserva, dict):
                reserva = reserva.get("numero")
        except json.JSONDecodeError:
            pass

    proveedor = doc.provider.nombre if doc.provider else None
    nit = doc.provider.nit if doc.provider else None
    return DocumentMatchContext(
        numero_documento=doc.numero_documento,
        nit=nit,
        proveedor=proveedor,
        compra=str(compra) if compra else None,
        reserva=str(reserva) if reserva else None,
        valor=doc.total,
        fecha=doc.fecha_emision,
    )


def _nested(data: dict, *keys: str):
    cur = data
    for key in keys:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


class MatchingEngine:
    """Clasifica coincidencias exactas, probables o sin match."""

    EXACT_THRESHOLD = 85.0
    PROBABLE_THRESHOLD = 55.0

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

        scored.sort(key=lambda c: c.score, reverse=True)
        best = scored[0]
        if best.score < self.PROBABLE_THRESHOLD:
            return None
        return best

    def score_pair(
        self,
        ctx: DocumentMatchContext,
        record: AutobitsRecordModel,
    ) -> MatchCandidate:
        score = 0.0
        reasons: list[str] = []

        doc_compra = ctx.compra
        doc_num = ctx.numero_documento

        if doc_compra and record.numero_compra and normalize_id(doc_compra) == normalize_id(record.numero_compra):
            score += 40
            reasons.append("compra_exacta")
        elif doc_num and record.numero_documento and normalize_id(doc_num) == normalize_id(record.numero_documento):
            score += 40
            reasons.append("documento_exacto")
        elif doc_num and record.numero_compra and normalize_id(doc_num) == normalize_id(record.numero_compra):
            score += 35
            reasons.append("doc_compra_cruzado")

        if ctx.nit and record.nit and normalize_nit(ctx.nit) == normalize_nit(record.nit):
            score += 25
            reasons.append("nit")

        if names_similar(ctx.proveedor, record.proveedor):
            score += 15
            reasons.append("proveedor")

        if ctx.reserva and record.numero_reserva and normalize_id(ctx.reserva) == normalize_id(record.numero_reserva):
            score += 10
            reasons.append("reserva")

        if values_close(ctx.valor, record.valor):
            score += 15
            reasons.append("valor")
        elif ctx.valor and record.valor:
            diff_pct = abs(ctx.valor - record.valor) / max(abs(ctx.valor), abs(record.valor), 1.0) * 100
            if diff_pct <= 5:
                score += 8
                reasons.append("valor_cercano")

        if ctx.fecha and record.fecha and ctx.fecha[:10] == record.fecha[:10]:
            score += 5
            reasons.append("fecha")

        if score > 100:
            score = 100.0

        match_type = self.classify(score, reasons)
        diferencia = None
        if ctx.valor is not None and record.valor is not None:
            diferencia = round(ctx.valor - record.valor, 2)

        return MatchCandidate(
            autobits_record_id=record.id,
            score=round(score, 1),
            match_type=match_type,
            reasons=reasons,
            valor_documento=ctx.valor,
            valor_autobits=record.valor,
            diferencia=diferencia,
            numero_compra=record.numero_compra,
            numero_reserva=record.numero_reserva,
            proveedor=record.proveedor or ctx.proveedor,
        )

    def classify(self, score: float, reasons: list[str]) -> str:
        has_strong_id = any(r in reasons for r in ("compra_exacta", "documento_exacto", "doc_compra_cruzado"))
        has_identity = "nit" in reasons or "proveedor" in reasons

        if score >= self.EXACT_THRESHOLD and has_strong_id and has_identity:
            return MatchType.MATCH_EXACTO
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
