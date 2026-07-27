package com.escuelaaves.sig.application.dto.dashboard.sheets;

import java.util.List;

public record SheetTableDto(
        String nombre,
        List<String> headers,
        List<List<String>> rows
) {
}
