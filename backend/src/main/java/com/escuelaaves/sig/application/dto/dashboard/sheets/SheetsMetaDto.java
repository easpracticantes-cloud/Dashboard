package com.escuelaaves.sig.application.dto.dashboard.sheets;

import java.util.List;

public record SheetsMetaDto(
        String ultimaActualizacion,
        String sheetName,
        String cachedAt,
        boolean fromCache,
        List<String> hojasProcesadas,
        int totalHojas
) {
}
