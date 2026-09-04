"""Enumeraciones del dominio contable."""

from enum import StrEnum


class DocumentType(StrEnum):
    FACTURA = "FACTURA"
    CUENTA_DE_COBRO = "CUENTA_DE_COBRO"
    COMPROBANTE_PAGO = "COMPROBANTE_PAGO"
    INGRESO = "INGRESO"
    OTRO = "OTRO"


class DocumentOrigin(StrEnum):
    WHATSAPP = "WHATSAPP"
    EMAIL = "EMAIL"
    DIAN = "DIAN"
    AUTOBITS = "AUTOBITS"
    CARGA_MANUAL = "CARGA_MANUAL"
    BATCH = "BATCH"


class DocumentStatus(StrEnum):
    RECIBIDO = "RECIBIDO"
    PROCESANDO = "PROCESANDO"
    EXTRAIDO = "EXTRAIDO"
    VALIDANDO = "VALIDANDO"
    CRUZANDO = "CRUZANDO"
    APROBADO = "APROBADO"
    PENDIENTE_PAGO = "PENDIENTE_PAGO"
    PAGADO = "PAGADO"
    COMPROBANTE_RECIBIDO = "COMPROBANTE_RECIBIDO"
    AUTOBITS_PENDIENTE = "AUTOBITS_PENDIENTE"
    AUTOBITS_ACTUALIZADO = "AUTOBITS_ACTUALIZADO"
    PAQUETE_DIGITAL = "PAQUETE_DIGITAL"
    ENTREGADO = "ENTREGADO"
    FINALIZADO = "FINALIZADO"
    ERROR = "ERROR"
    REQUIERE_REVISION = "REQUIERE_REVISION"
    SUBSANACION = "SUBSANACION"
    DUPLICADO = "DUPLICADO"
    ANULADO = "ANULADO"
    PROCESADO = "PROCESADO"  # compatibilidad POC batch


class ProcessingJobStatus(StrEnum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    REQUIRES_REVIEW = "REQUIRES_REVIEW"


class ProcessingMode(StrEnum):
    INVOICE_BATCH = "INVOICE_BATCH"
    INTERACTIVE = "INTERACTIVE"


class ImportBatchStatus(StrEnum):
    PREVIEW = "PREVIEW"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class AutobitsRecordStatus(StrEnum):
    IMPORTADO = "IMPORTADO"
    LISTO_PARA_ACTUALIZAR = "LISTO_PARA_ACTUALIZAR"
    ACTUALIZADO = "ACTUALIZADO"


class MatchType(StrEnum):
    MATCH_EXACTO = "MATCH_EXACTO"
    MATCH_PROBABLE = "MATCH_PROBABLE"
    SIN_MATCH = "SIN_MATCH"
    DESDE_AUTOBITS = "DESDE_AUTOBITS"


class CrossingStatus(StrEnum):
    PENDIENTE = "PENDIENTE"  # Autobits cargado, falta factura/CDC
    EN_REVISION = "EN_REVISION"
    APROBADO = "APROBADO"  # Ya tiene factura/CDC (texto)
    SUBSANACION = "SUBSANACION"
    PAGADO = "PAGADO"  # Confirmación bancaria vía PaymentService.mark_paid (no fecha/obs Excel)
    ARCHIVADO = "ARCHIVADO"  # Fuera del Excel vigente (semana anterior)


class RemediationType(StrEnum):
    DIFERENCIA_VALOR = "DIFERENCIA_VALOR"
    SIN_MATCH = "SIN_MATCH"
    SIN_NUMERO_DOCUMENTO = "SIN_NUMERO_DOCUMENTO"
    SIN_PROVEEDOR = "SIN_PROVEEDOR"
    COMPRA_SIN_RESERVA = "COMPRA_SIN_RESERVA"
    NIT_NO_COINCIDE = "NIT_NO_COINCIDE"
    OTRO = "OTRO"


class RemediationStatus(StrEnum):
    PENDIENTE = "PENDIENTE"
    EN_PROCESO = "EN_PROCESO"
    CORREGIDO = "CORREGIDO"
    CERRADO = "CERRADO"


class PaymentStatus(StrEnum):
    PENDIENTE_APROBACION = "PENDIENTE_APROBACION"
    APROBADO = "APROBADO"
    PENDIENTE_PAGO = "PENDIENTE_PAGO"
    PAGADO = "PAGADO"  # confirmado en banco por Andrea
    COMPROBANTE_PENDIENTE = "COMPROBANTE_PENDIENTE"
    COMPLETADO = "COMPLETADO"
    ANULADO = "ANULADO"


# Pagos generados que aún no tienen confirmación bancaria.
PAGOS_SIN_CONFIRMACION_BANCARIA = {
    PaymentStatus.PENDIENTE_APROBACION,
    PaymentStatus.APROBADO,
    PaymentStatus.PENDIENTE_PAGO,
}


class AdjustmentAction(StrEnum):
    """Correcciones contables: nunca se borra, se registra el ajuste."""

    ANULACION = "ANULACION"
    AJUSTE = "AJUSTE"


class PeriodClosureStatus(StrEnum):
    OPEN = "OPEN"
    CLOSED = "CLOSED"


class StorageFolderType(StrEnum):
    FACTURA = "FACTURA"
    PAGOS = "PAGOS"
    INGRESOS = "INGRESOS"
    SUBSANACIONES = "SUBSANACIONES"
    PAQUETES_DIGITALES = "PAQUETES_DIGITALES"
    OTRO = "OTRO"


class PackageStatus(StrEnum):
    PENDIENTE = "PENDIENTE"
    GENERADO = "GENERADO"
    ENTREGADO = "ENTREGADO"
    DIGITALIZADO = "DIGITALIZADO"
    CERRADO = "CERRADO"
