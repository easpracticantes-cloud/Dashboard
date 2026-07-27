package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.application.dto.integration.SheetConversationRowDto;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.SystemSettingRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.GoogleSheetsPort;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Optional;

/**
 * Stub de Google Sheets solo para perfil {@code test}.
 * En runtime el bean productivo es {@link GoogleSheetsAdapter}.
 */
@Slf4j
@Component
@org.springframework.context.annotation.Profile("test")
@RequiredArgsConstructor
public class GoogleSheetsStubAdapter implements GoogleSheetsPort {

    private final SystemSettingRepositoryPort systemSettingRepositoryPort;

    @Override
    public IntegrationCode code() {
        return IntegrationCode.GOOGLE_SHEETS;
    }

    @Override
    public IntegrationStatus status() {
        return isEnabled() ? IntegrationStatus.READY : IntegrationStatus.DISABLED;
    }

    @Override
    public boolean exportRows(String sheetName, Object rows) {
        log.info("[GoogleSheets-STUB] Exportacion simulada hacia la hoja '{}'", sheetName);
        return isEnabled();
    }

    @Override
    public List<SheetConversationRowDto> fetchConversationRows(String spreadsheetId, String range) {
        log.info("[GoogleSheets-STUB] Lectura simulada spreadsheetId='{}' range='{}'", spreadsheetId, range);
        return List.of();
    }

    @Override
    public Optional<JsonNode> fetchDashboardRaw(String webAppUrl) {
        log.info("[GoogleSheets-STUB] fetchDashboardRaw url='{}'", webAppUrl);
        return Optional.empty();
    }

    private boolean isEnabled() {
        return systemSettingRepositoryPort.findBySettingKey("integrations.googleSheetsEnabled")
                .map(s -> "true".equalsIgnoreCase(s.getSettingValue()))
                .orElse(false);
    }
}
