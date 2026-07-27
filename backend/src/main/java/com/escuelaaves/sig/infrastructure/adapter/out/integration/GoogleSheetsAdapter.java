package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.application.dto.integration.SheetConversationRowDto;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.SystemSettingRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.GoogleSheetsPort;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Adaptador real de Google Sheets vía Apps Script Web App.
 */
@Slf4j
@Primary
@Component
@RequiredArgsConstructor
public class GoogleSheetsAdapter implements GoogleSheetsPort {

    private final SystemSettingRepositoryPort systemSettingRepositoryPort;
    private final RestClient.Builder restClientBuilder;
    private final ObjectMapper objectMapper;

    @Override
    public IntegrationCode code() {
        return IntegrationCode.GOOGLE_SHEETS;
    }

    @Override
    public IntegrationStatus status() {
        if (!isEnabled()) {
            return IntegrationStatus.DISABLED;
        }
        String url = webAppUrl();
        return url.isBlank() ? IntegrationStatus.ERROR : IntegrationStatus.READY;
    }

    @Override
    public boolean exportRows(String sheetName, Object rows) {
        log.info("[GoogleSheets] Exportacion hacia hoja '{}' no implementada via Web App (solo lectura dashboard).", sheetName);
        return isEnabled();
    }

    @Override
    public List<SheetConversationRowDto> fetchConversationRows(String spreadsheetId, String range) {
        Optional<JsonNode> raw = fetchDashboardRaw(webAppUrl());
        if (raw.isEmpty()) {
            log.info("[GoogleSheets] Sin payload para mapear filas (spreadsheetId='{}' range='{}')", spreadsheetId, range);
            return List.of();
        }
        return mapSeguimientoToRows(raw.get());
    }

    @Override
    public Optional<JsonNode> fetchDashboardRaw(String webAppUrl) {
        if (webAppUrl == null || webAppUrl.isBlank()) {
            log.warn("[GoogleSheets] webAppUrl vacia");
            return Optional.empty();
        }
        try {
            String body = restClientBuilder.build()
                    .get()
                    .uri(webAppUrl.trim())
                    .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_PLAIN, MediaType.ALL)
                    .retrieve()
                    .body(String.class);

            if (body == null || body.isBlank()) {
                log.warn("[GoogleSheets] Respuesta vacia del Web App");
                return Optional.empty();
            }

            JsonNode node = objectMapper.readTree(body);
            log.info("[GoogleSheets] Dashboard payload OK (keys={})", node.fieldNames().hasNext() ? "present" : "empty");
            return Optional.of(node);
        } catch (RestClientException ex) {
            log.error("[GoogleSheets] Error HTTP al llamar Web App: {}", ex.getMessage());
            return Optional.empty();
        } catch (Exception ex) {
            log.error("[GoogleSheets] Error parseando JSON del Web App: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    private List<SheetConversationRowDto> mapSeguimientoToRows(JsonNode root) {
        JsonNode array = root.path("seguimientoWhatsapp");
        if (!array.isArray()) {
            return List.of();
        }
        List<SheetConversationRowDto> rows = new ArrayList<>();
        for (JsonNode item : array) {
            String phone = text(item, "celular");
            String name = text(item, "cliente");
            if (phone.isBlank()) {
                continue;
            }
            if (name.isBlank()) {
                name = phone;
            }
            String fecha = text(item, "fecha");
            String date = fecha.length() >= 10 ? fecha.substring(0, 10) : fecha;
            String time = fecha.length() >= 19 ? fecha.substring(11, 19) : "";
            rows.add(new SheetConversationRowDto(
                    phone,
                    name,
                    date,
                    time,
                    text(item, "solicitud"),
                    text(item, "semaforo"),
                    text(item, "respuesta"),
                    text(item, "canal")
            ));
        }
        return rows;
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.path(field);
        if (value.isMissingNode() || value.isNull()) {
            return "";
        }
        if (value.isBoolean() || value.isNumber()) {
            return value.asText();
        }
        return value.asText("").trim();
    }

    private boolean isEnabled() {
        return systemSettingRepositoryPort.findBySettingKey("integrations.googleSheetsEnabled")
                .map(s -> "true".equalsIgnoreCase(s.getSettingValue()))
                .orElse(false);
    }

    private String webAppUrl() {
        return systemSettingRepositoryPort.findBySettingKey("integrations.googleSheets.webAppUrl")
                .map(s -> s.getSettingValue() != null ? s.getSettingValue() : "")
                .orElse("");
    }
}
