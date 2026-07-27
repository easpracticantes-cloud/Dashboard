package com.escuelaaves.sig.application.dto.dashboard.sheets;

public record MonthlyPointDto(
        String mes,
        long seguimientos,
        long ventas
) {
}
