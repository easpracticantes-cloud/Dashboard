package com.escuelaaves.sig.infrastructure.ai.adapters.anthropic;

import com.escuelaaves.sig.infrastructure.ai.config.AnthropicProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Lee el gasto real de la organización vía Admin Cost API
 * ({@code GET /v1/organizations/cost_report}), el mismo origen que la Consola Anthropic.
 * Requiere {@code ANTHROPIC_ADMIN_API_KEY} (sk-ant-admin…). Si no hay, intenta la API key normal.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class AnthropicBillingClient {

    private static final Duration CACHE_TTL = Duration.ofMinutes(5);

    private final AnthropicProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(12))
            .build();

    private final AtomicReference<Cached> cache = new AtomicReference<>();

    public Optional<OrgBilling> fetchCurrentMonthBilling() {
        Cached hit = cache.get();
        if (hit != null && hit.expiresAt().isAfter(Instant.now())) {
            return Optional.of(hit.value());
        }
        Optional<OrgBilling> fresh = fetchUncached();
        fresh.ifPresent(v -> cache.set(new Cached(v, Instant.now().plus(CACHE_TTL))));
        return fresh;
    }

    private Optional<OrgBilling> fetchUncached() {
        String key = resolveBillingKey();
        if (key == null) {
            return Optional.empty();
        }
        try {
            LocalDate start = LocalDate.now(ZoneOffset.UTC).withDayOfMonth(1);
            String startingAt = DateTimeFormatter.ISO_INSTANT.format(start.atStartOfDay().toInstant(ZoneOffset.UTC));
            String endingAt = DateTimeFormatter.ISO_INSTANT.format(Instant.now());
            String url = properties.baseUrl().replaceAll("/$", "")
                    + "/v1/organizations/cost_report"
                    + "?starting_at=" + URLEncoder.encode(startingAt, StandardCharsets.UTF_8)
                    + "&ending_at=" + URLEncoder.encode(endingAt, StandardCharsets.UTF_8)
                    + "&bucket_width=1d"
                    + "&limit=31";

            HttpRequest.Builder req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(25))
                    .header("x-api-key", key)
                    .header("anthropic-version", properties.apiVersion())
                    .header("anthropic-beta", "admin-api-2024-01-31")
                    .GET();

            HttpResponse<String> response = httpClient.send(req.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 401 || response.statusCode() == 403) {
                log.warn("[AnthropicBilling] cost_report {} — se necesita ANTHROPIC_ADMIN_API_KEY (sk-ant-admin…)",
                        response.statusCode());
                return Optional.empty();
            }
            if (response.statusCode() < 200 || response.statusCode() >= 300) {
                log.warn("[AnthropicBilling] cost_report HTTP {}: {}", response.statusCode(),
                        truncate(response.body()));
                return Optional.empty();
            }

            JsonNode root = objectMapper.readTree(response.body());
            BigDecimal cents = BigDecimal.ZERO;
            JsonNode data = root.path("data");
            if (data.isArray()) {
                for (JsonNode bucket : data) {
                    JsonNode results = bucket.path("results");
                    if (!results.isArray()) {
                        continue;
                    }
                    for (JsonNode item : results) {
                        String amount = text(item, "amount");
                        if (amount == null || amount.isBlank()) {
                            continue;
                        }
                        try {
                            cents = cents.add(new BigDecimal(amount.trim()));
                        } catch (NumberFormatException ignored) {
                            // skip bad row
                        }
                    }
                }
            }
            // amount viene en centavos (lowest units): "169" ≈ $1.69
            BigDecimal usd = cents.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP);
            log.info("[AnthropicBilling] gasto mes (Consola) = {} USD (cents={})", usd, cents);
            return Optional.of(new OrgBilling(usd, "anthropic_cost_report", Instant.now()));
        } catch (Exception ex) {
            log.warn("[AnthropicBilling] no se pudo leer cost_report: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    private String resolveBillingKey() {
        if (properties.adminApiKey() != null && !properties.adminApiKey().isBlank()) {
            return properties.adminApiKey().trim();
        }
        if (properties.hasApiKey()) {
            return properties.apiKey().trim();
        }
        return null;
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static String truncate(String s) {
        if (s == null) {
            return "";
        }
        return s.length() <= 240 ? s : s.substring(0, 240) + "…";
    }

    public record OrgBilling(BigDecimal monthSpentUsd, String source, Instant fetchedAt) {
    }

    private record Cached(OrgBilling value, Instant expiresAt) {
    }
}
