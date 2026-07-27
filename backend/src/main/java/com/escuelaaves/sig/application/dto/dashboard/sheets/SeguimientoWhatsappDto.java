package com.escuelaaves.sig.application.dto.dashboard.sheets;

import java.math.BigDecimal;

public record SeguimientoWhatsappDto(
        String fecha,
        String tipo,
        String canal,
        String cliente,
        String celular,
        String solicitud,
        String respuesta,
        String semaforo,
        boolean cotizado,
        String notas,
        String fechaServicio,
        boolean encuesta,
        String asignado,
        String proximoSeguimiento,
        String hojaOrigen,
        String disc,
        String priorizar,
        String pendiente,
        String objecion,
        String excelente,
        String buena,
        String regular,
        String registrado,
        String fechaCotizado,
        BigDecimal monto
) {
}
