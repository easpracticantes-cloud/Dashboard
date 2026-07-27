package com.escuelaaves.sig.application.dto.dashboard.sheets;

public record VentaDto(
        String fechaCot,
        String tipoCliente,
        String nombre,
        String celular,
        String servicio,
        String venta,
        String codigo,
        String fechaServicio,
        String realizado,
        String envioReserva,
        String pagoAutobits,
        String soporteDrive,
        String hojaOrigen
) {
}
