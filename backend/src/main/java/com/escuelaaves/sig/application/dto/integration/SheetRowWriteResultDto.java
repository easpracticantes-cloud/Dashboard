package com.escuelaaves.sig.application.dto.integration;

import java.util.List;

public record SheetRowWriteResultDto(
        boolean success,
        String message,
        String sheetName,
        Integer rowNumber,
        List<String> updatedFields
) {
}
