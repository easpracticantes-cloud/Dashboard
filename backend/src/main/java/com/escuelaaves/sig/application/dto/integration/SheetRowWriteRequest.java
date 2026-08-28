package com.escuelaaves.sig.application.dto.integration;

import jakarta.validation.constraints.NotBlank;

import java.util.Map;

/**
 * Actualiza o agrega una fila en Google Sheets vía Apps Script Web App.
 */
public record SheetRowWriteRequest(
        @NotBlank String action,
        @NotBlank String sheetName,
        Map<String, String> match,
        Map<String, Object> fields
) {
}
