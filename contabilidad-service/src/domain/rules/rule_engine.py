"""Motor de reglas basico — evolucion de validador.py."""

from dataclasses import dataclass, field

from domain.enums import CrossingStatus, MatchType, RemediationType
from domain.matching.matching_engine import DocumentMatchContext, MatchCandidate
from domain.matching.normalize import normalize_nit, values_close
from validador import validar_factura


@dataclass
class RuleResult:
    passed: bool
    estado: str
    observaciones: list[str] = field(default_factory=list)
    campos_faltantes: list[str] = field(default_factory=list)
    requiere_revision: bool = False


class RuleEngine:
    """Reglas determinísticas extensibles (Fase 1: validacion POC)."""

    def evaluate_invoice(self, extracted: dict) -> RuleResult:
        datos, estado, observaciones = validar_factura(dict(extracted))
        obs_list = []
        if observaciones:
            obs_list = [o.strip() for o in str(observaciones).split(";") if o.strip()]

        return RuleResult(
            passed=estado == "procesado" and not datos.get("requiere_revision"),
            estado=estado,
            observaciones=obs_list,
            campos_faltantes=list(datos.get("campos_faltantes") or []),
            requiere_revision=bool(datos.get("requiere_revision")),
        )

    def map_estado_documento(self, rule: RuleResult) -> str:
        if rule.estado == "procesado" and not rule.requiere_revision:
            return "EXTRAIDO"
        if rule.requiere_revision or rule.estado == "revisar":
            return "REQUIERE_REVISION"
        return "ERROR"

    def evaluate_crossing(
        self,
        ctx: DocumentMatchContext,
        candidate: MatchCandidate,
        record_nit: str | None = None,
    ) -> tuple[str, list[RemediationType], list[str]]:
        """Evalúa reglas de cruce R1-R7 y propone estado + subsanaciones."""
        observaciones: list[str] = []
        remediations: list[RemediationType] = []

        if candidate.match_type == MatchType.SIN_MATCH:
            remediations.append(RemediationType.SIN_MATCH)
            observaciones.append("No se encontró registro Autobits coincidente.")
            return CrossingStatus.PENDIENTE, remediations, observaciones

        if not ctx.numero_documento and not ctx.compra:
            remediations.append(RemediationType.SIN_NUMERO_DOCUMENTO)
            observaciones.append("Documento sin número de factura o compra.")

        if not ctx.proveedor:
            remediations.append(RemediationType.SIN_PROVEEDOR)
            observaciones.append("Documento sin proveedor identificado.")

        if ctx.compra and not ctx.reserva and not candidate.numero_reserva:
            remediations.append(RemediationType.COMPRA_SIN_RESERVA)
            observaciones.append("Compra sin reserva relacionada.")

        if ctx.valor is not None and candidate.valor_autobits is not None:
            if not values_close(ctx.valor, candidate.valor_autobits):
                remediations.append(RemediationType.DIFERENCIA_VALOR)
                observaciones.append(
                    f"Diferencia de valor: doc {ctx.valor} vs Autobits {candidate.valor_autobits}."
                )

        if ctx.nit and record_nit and normalize_nit(ctx.nit) != normalize_nit(record_nit):
            remediations.append(RemediationType.NIT_NO_COINCIDE)
            observaciones.append("NIT del documento no coincide con Autobits.")

        if remediations:
            if RemediationType.DIFERENCIA_VALOR in remediations:
                return CrossingStatus.SUBSANACION, remediations, observaciones
            if candidate.match_type == MatchType.MATCH_PROBABLE:
                return CrossingStatus.EN_REVISION, remediations, observaciones
            return CrossingStatus.PENDIENTE, remediations, observaciones

        if candidate.match_type == MatchType.MATCH_EXACTO:
            observaciones.append("Cruce exacto — listo para aprobación.")
            return CrossingStatus.APROBADO, remediations, observaciones

        if candidate.match_type == MatchType.MATCH_PROBABLE:
            observaciones.append(f"Match probable ({candidate.score}%) — requiere revisión humana.")
            return CrossingStatus.EN_REVISION, remediations, observaciones

        return CrossingStatus.PENDIENTE, remediations, observaciones
