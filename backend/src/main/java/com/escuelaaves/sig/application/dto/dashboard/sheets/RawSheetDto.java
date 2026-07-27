package com.escuelaaves.sig.application.dto.dashboard.sheets;

import java.util.List;

public record RawSheetDto(
        String nombre,
        long rawRowCount,
        List<List<Object>> fullData
) {
}
