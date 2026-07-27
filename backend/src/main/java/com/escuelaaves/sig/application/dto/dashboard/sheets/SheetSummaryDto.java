package com.escuelaaves.sig.application.dto.dashboard.sheets;

public record SheetSummaryDto(
        String nombre,
        long rowCount,
        String preview,
        String estado
) {
}
