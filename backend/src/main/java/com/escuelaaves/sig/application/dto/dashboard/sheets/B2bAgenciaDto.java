package com.escuelaaves.sig.application.dto.dashboard.sheets;

public record B2bAgenciaDto(
        String agencia,
        String estado,
        String contacto,
        String telefono,
        String correo,
        String notas,
        String cotizacionesAnual,
        String reservasAnual,
        String tipologiaRentable,
        String ticketPromedio,
        String margenNeto
) {
}
