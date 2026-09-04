"""Proveedor de pagos manual — sin integración bancaria."""

from domain.enums import PaymentStatus

# Un pago solo llega a PAGADO cuando Andrea confirma la transferencia en el
# banco. Crear o aprobar el pago nunca representa salida de dinero.
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    PaymentStatus.PENDIENTE_APROBACION: {
        PaymentStatus.APROBADO,
        PaymentStatus.PENDIENTE_PAGO,
        PaymentStatus.ANULADO,
    },
    PaymentStatus.APROBADO: {PaymentStatus.PENDIENTE_PAGO, PaymentStatus.ANULADO},
    PaymentStatus.PENDIENTE_PAGO: {PaymentStatus.PAGADO, PaymentStatus.ANULADO},
    PaymentStatus.PAGADO: {
        PaymentStatus.COMPROBANTE_PENDIENTE,
        PaymentStatus.COMPLETADO,
        PaymentStatus.ANULADO,
    },
    PaymentStatus.COMPROBANTE_PENDIENTE: {PaymentStatus.COMPLETADO, PaymentStatus.ANULADO},
    PaymentStatus.COMPLETADO: {PaymentStatus.ANULADO},
    PaymentStatus.ANULADO: set(),
}

# Estados desde los que anular exige justificación explícita en el ajuste.
REQUIEREN_MOTIVO_REFORZADO: set[str] = {
    PaymentStatus.PAGADO,
    PaymentStatus.COMPROBANTE_PENDIENTE,
    PaymentStatus.COMPLETADO,
}


class ManualPaymentProvider:
    """Gestiona transiciones de estado de pago — human-in-the-loop."""

    ALLOWED_TRANSITIONS = ALLOWED_TRANSITIONS

    def can_transition(self, current: str, target: str) -> bool:
        return target in ALLOWED_TRANSITIONS.get(current, set())

    def allowed_targets(self, current: str) -> set[str]:
        return set(ALLOWED_TRANSITIONS.get(current, set()))

    def requires_strong_reason(self, current: str) -> bool:
        """Anular un pago ya ejecutado en banco exige motivo detallado."""
        return current in REQUIEREN_MOTIVO_REFORZADO

    def list_pending_execution(self, payments: list) -> list:
        """Pagos listos para que Andrea ejecute en Bancolombia."""
        return [p for p in payments if getattr(p, "estado", None) == PaymentStatus.PENDIENTE_PAGO]

    def requires_receipt_for_completion(self) -> bool:
        return True
