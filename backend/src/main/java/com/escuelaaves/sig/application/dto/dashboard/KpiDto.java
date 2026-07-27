package com.escuelaaves.sig.application.dto.dashboard;

public record KpiDto(
        String code,
        String label,
        long value,
        Double changePercent
) {
}
