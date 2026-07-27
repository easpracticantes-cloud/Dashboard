package com.escuelaaves.sig.domain.port.out.integration;

import com.escuelaaves.sig.application.dto.integration.SheetConversationRowDto;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.Optional;

public interface GoogleSheetsPort extends IntegrationPort {

    boolean exportRows(String sheetName, Object rows);

    /**
     * Lee filas de conversaciones desde la hoja configurada (rango A1).
     */
    List<SheetConversationRowDto> fetchConversationRows(String spreadsheetId, String range);

    /**
     * Obtiene el JSON del Web App de Apps Script (dashboard operativo).
     */
    Optional<JsonNode> fetchDashboardRaw(String webAppUrl);
}
