"""Proveedor de pagos manual — sin integración bancaria."""

from domain.enums import PaymentStatus

ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    PaymentStatus.PENDIENTE_APROBACION: {PaymentStatus.APROBADO, PaymentStatus.PENDIENTE_PAGO},
    PaymentStatus.APROBADO: {PaymentStatus.PENDIENTE_PAGO},
    PaymentStatus.PENDIENTE_PAGO: {PaymentStatus.PAGADO},
    PaymentStatus.PAGADO: {PaymentStatus.COMPROBANTE_PENDIENTE, PaymentStatus.COMPLETADO},
    PaymentStatus.COMPROBANTE_PENDIENTE: {PaymentStatus.COMPLETADO},
    PaymentStatus.COMPLETADO: set(),
}


class ManualPaymentProvider:
    """Gestiona transiciones de estado de pago — human-in-the-loop."""

    def can_transition(self, current: str, target: str) -> bool:
        return target in ALLOWED_TRANSITIONS.get(current, set())

    def list_pending_execution(self, payments: list) -> list:
        """Pagos listos para que Andrea ejecute en Bancolombia."""
        return [p for p in payments if getattr(p, "estado", None) == PaymentStatus.PENDIENTE_PAGO]

    def requires_receipt_for_completion(self) -> bool:
        return True
