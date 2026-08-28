package com.escuelaaves.sig.infrastructure.adapter.out.integration;

import com.escuelaaves.sig.application.dto.integration.SheetConversationRowDto;
import com.escuelaaves.sig.application.dto.integration.SheetRowWriteRequest;
import com.escuelaaves.sig.application.dto.integration.SheetRowWriteResultDto;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.port.out.SystemSettingRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.GoogleSheetsPort;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Adaptador real de Google Sheets vía Apps Script Web App (lectura + escritura).
 */
@Slf4j
@Primary
@Component
@RequiredArgsConstructor
public class GoogleSheetsAdapter implements GoogleSheetsPort {

    private final SystemSettingRepositoryPort systemSettingRepositoryPort;
    private final RestClient.Builder restClientBuilder;
    private final ObjectMapper objectMapper;

    @Value("${app.sheets.write-token:}")
    private String writeTokenFromEnv;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

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
        if (!(rows instanceof Map<?, ?> map)) {
            log.info("[GoogleSheets] exportRows requiere Map fields; hoja='{}'", sheetName);
            return false;
        }
        Map<String, Object> fields = new LinkedHashMap<>();
        map.forEach((k, v) -> fields.put(String.valueOf(k), v));
        SheetRowWriteResultDto result = writeRow(new SheetRowWriteRequest(
                "appendrow",
                sheetName,
                Map.of(),
                fields
        ));
        return result.success();
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
            long t0 = System.nanoTime();
            String body = restClientBuilder.build()
                    .get()
                    .uri(webAppUrl.trim())
                    .accept(MediaType.APPLICATION_JSON, MediaType.TEXT_PLAIN, MediaType.ALL)
                    .retrieve()
                    .body(String.class);
            long httpMs = (System.nanoTime() - t0) / 1_000_000;

            if (body == null || body.isBlank()) {
                log.warn("[GoogleSheets] Respuesta vacia del Web App (httpMs={})", httpMs);
                return Optional.empty();
            }

            JsonNode node = objectMapper.readTree(body);
            int rootKeys = 0;
            var names = node.fieldNames();
            while (names.hasNext()) {
                names.next();
                rootKeys++;
            }
            JsonNode data = node.path("data");
            int dataKeys = data.isObject() ? data.size() : 0;
            if (data.isObject()) {
                data.fields().forEachRemaining(entry -> {
                    JsonNode sheet = entry.getValue();
                    if (sheet != null && sheet.isObject()) {
                        boolean hasFull = sheet.has("fullData") && sheet.get("fullData").isArray();
                        int fullSize = hasFull ? sheet.get("fullData").size() : 0;
                        int previewSize = sheet.path("firstFewRows").isArray() ? sheet.get("firstFewRows").size() : 0;
                        long rawCount = sheet.path("rawRowCount").asLong(sheet.path("rowCount").asLong(0));
                        log.info(
                                "[GoogleSheets] Hoja '{}' fullData={} firstFewRows={} rawRowCount={} hasFullData={}",
                                entry.getKey(), fullSize, previewSize, rawCount, hasFull
                        );
                    }
                });
            }
            log.info(
                    "[GoogleSheets] Dashboard payload OK (rootKeys={}, dataKeys={}, bytes={}, httpMs={})",
                    rootKeys,
                    dataKeys,
                    body.length(),
                    httpMs
            );
            return Optional.of(node);
        } catch (RestClientException ex) {
            log.error("[GoogleSheets] Error HTTP al llamar Web App: {}", ex.getMessage());
            return Optional.empty();
        } catch (Exception ex) {
            log.error("[GoogleSheets] Error parseando JSON del Web App: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    @Override
    public SheetRowWriteResultDto writeRow(SheetRowWriteRequest request) {
        String url = webAppUrl();
        if (url.isBlank()) {
            return new SheetRowWriteResultDto(false, "Web App URL no configurada", request.sheetName(), null, List.of());
        }
        if (!isEnabled()) {
            return new SheetRowWriteResultDto(false, "Google Sheets deshabilitado", request.sheetName(), null, List.of());
        }

        try {
            Map<String, Object> payload = new LinkedHashMap<>();
            payload.put("action", request.action());
            payload.put("sheetName", request.sheetName());
            payload.put("match", request.match() == null ? Map.of() : request.match());
            payload.put("fields", request.fields() == null ? Map.of() : request.fields());
            String token = resolveWriteToken();
            if (!token.isBlank()) {
                payload.put("token", token);
            }

            String json = objectMapper.writeValueAsString(payload);
            String responseBody = postFollowingAppsScriptRedirect(url.trim(), json);
            if (responseBody == null || responseBody.isBlank()) {
                return new SheetRowWriteResultDto(
                        false,
                        "Respuesta vacía del Web App. ¿Desplegaste doPost? Ver documentos/google_sheets_webapp_write.gs",
                        request.sheetName(),
                        null,
                        List.of()
                );
            }

            JsonNode node = objectMapper.readTree(responseBody);
            boolean ok = node.path("ok").asBoolean(false);
            String error = text(node, "error");
            String message = ok ? text(node, "message") : error;
            if (message.isBlank()) {
                message = ok ? "Fila actualizada en Google Sheets" : "Escritura fallida en Google Sheets";
            }
            Integer rowNumber = node.has("rowNumber") && node.get("rowNumber").canConvertToInt()
                    ? node.get("rowNumber").asInt()
                    : null;
            List<String> updated = new ArrayList<>();
            if (node.path("updatedFields").isArray()) {
                node.path("updatedFields").forEach(n -> updated.add(n.asText()));
            }
            log.info("[GoogleSheets] writeRow action={} sheet={} ok={} row={}", request.action(), request.sheetName(), ok, rowNumber);
            return new SheetRowWriteResultDto(ok, message, request.sheetName(), rowNumber, updated);
        } catch (Exception ex) {
            log.error("[GoogleSheets] writeRow error: {}", ex.getMessage());
            return new SheetRowWriteResultDto(
                    false,
                    "Error escribiendo en Sheets: " + ex.getMessage()
                            + ". Si el Web App aún no tiene doPost, despliega documentos/google_sheets_webapp_write.gs",
                    request.sheetName(),
                    null,
                    List.of()
            );
        }
    }

    /**
     * Apps Script responde 302; hay que re-POST al Location (no convertir a GET).
     */
    private String postFollowingAppsScriptRedirect(String url, String jsonBody) throws Exception {
        HttpRequest.BodyPublisher body = HttpRequest.BodyPublishers.ofString(jsonBody);
        HttpRequest first = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(60))
                .header("Content-Type", "application/json; charset=UTF-8")
                .header("Accept", "application/json, text/plain, */*")
                .POST(body)
                .build();

        HttpResponse<String> response = httpClient.send(first, HttpResponse.BodyHandlers.ofString());
        int code = response.statusCode();
        if (code >= 200 && code < 300) {
            return response.body();
        }
        if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
            String location = response.headers().firstValue("location").orElse("");
            if (location.isBlank()) {
                throw new IllegalStateException("Redirect sin Location (HTTP " + code + ")");
            }
            URI next = URI.create(url).resolve(location);
            HttpRequest second = HttpRequest.newBuilder(next)
                    .timeout(Duration.ofSeconds(60))
                    .header("Content-Type", "application/json; charset=UTF-8")
                    .header("Accept", "application/json, text/plain, */*")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();
            HttpResponse<String> redirected = httpClient.send(second, HttpResponse.BodyHandlers.ofString());
            if (redirected.statusCode() >= 200 && redirected.statusCode() < 300) {
                return redirected.body();
            }
            throw new IllegalStateException(
                    "Web App respondió HTTP " + redirected.statusCode() + " tras redirect: "
                            + truncate(redirected.body(), 240)
            );
        }
        throw new IllegalStateException("Web App respondió HTTP " + code + ": " + truncate(response.body(), 240));
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

    private static String truncate(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max);
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

    private String resolveWriteToken() {
        String fromSetting = systemSettingRepositoryPort.findBySettingKey("integrations.googleSheets.writeToken")
                .map(s -> s.getSettingValue() != null ? s.getSettingValue() : "")
                .orElse("");
        if (!fromSetting.isBlank()) {
            return fromSetting.trim();
        }
        return writeTokenFromEnv == null ? "" : writeTokenFromEnv.trim();
    }
}
