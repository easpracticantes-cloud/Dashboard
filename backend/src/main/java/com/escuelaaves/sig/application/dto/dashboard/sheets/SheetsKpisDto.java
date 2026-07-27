package com.escuelaaves.sig.application.dto.dashboard.sheets;

public record SheetsKpisDto(
        long totalContactos,
        long totalVentas,
        double tasaConversion,
        long totalConEncuesta,
        long totalTibioCaliente
) {
}
