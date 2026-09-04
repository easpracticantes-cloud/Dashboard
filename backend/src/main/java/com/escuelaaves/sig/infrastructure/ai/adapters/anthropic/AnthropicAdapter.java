package com.escuelaaves.sig.infrastructure.ai.adapters.anthropic;

import com.escuelaaves.sig.application.ai.AiModelRouter;
import com.escuelaaves.sig.application.ai.AiUsageService;
import com.escuelaaves.sig.application.ai.CommercialCatalogService;
import com.escuelaaves.sig.application.ai.ContextRetriever;
import com.escuelaaves.sig.domain.ai.model.AiModelTier;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.infrastructure.ai.adapters.PromptingGenerativeAiAdapter;
import com.escuelaaves.sig.infrastructure.ai.config.AnthropicProperties;
import com.escuelaaves.sig.infrastructure.ai.config.AnthropicRestClientConfig;
import com.escuelaaves.sig.infrastructure.ai.support.AiPromptTrace;
import com.escuelaaves.sig.infrastructure.ai.support.AiStructuredJson;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Adapter hexagonal hacia Anthropic Messages API (Claude Haiku / Sonnet).
 */
@Slf4j
@Component
public class AnthropicAdapter extends PromptingGenerativeAiAdapter {

    private final RestClient anthropicRestClient;
    private final AnthropicProperties properties;
    private final AiModelRouter modelRouter;
    private final AiUsageService usageService;

    public AnthropicAdapter(
            @Qualifier(AnthropicRestClientConfig.ANTHROPIC_REST_CLIENT) RestClient anthropicRestClient,
            AnthropicProperties properties,
            ObjectMapper objectMapper,
            CommercialCatalogService commercialCatalog,
            ContextRetriever contextRetriever,
            AiModelRouter modelRouter,
            AiUsageService usageService
    ) {
        super(objectMapper, commercialCatalog, contextRetriever);
        this.anthropicRestClient = anthropicRestClient;
        this.properties = properties;
        this.modelRouter = modelRouter;
        this.usageService = usageService;
    }

    @Override
    public IntegrationCode code() {
        return IntegrationCode.CLAUDE_AI;
    }

    @Override
    public IntegrationStatus status() {
        return properties.hasApiKey() ? IntegrationStatus.READY : IntegrationStatus.DISABLED;
    }

    @Override
    public String providerId() {
        return "claude";
    }

    @Override
    protected String generateText(String systemPrompt, String userMessage, boolean jsonMode, String operation) {
        ensureConfigured();
        if (userMessage == null || userMessage.isBlank()) {
            throw new BadRequestException("El mensaje para Anthropic no puede estar vacío");
        }

        AiModelTier tier = modelRouter.resolve(operation, userMessage).recommendedTier();
        String model = properties.modelFor(tier);
        String system = systemPrompt != null ? systemPrompt : "";
        if (jsonMode) {
            system = system + "\n\nResponde ÚNICAMENTE con JSON válido. Sin markdown ni texto fuera del JSON.";
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("max_tokens", properties.maxTokens());
        body.put("system", system);
        body.put("messages", List.of(Map.of(
                "role", "user",
                "content", userMessage
        )));
        body.put("temperature", jsonMode ? 0.1 : 0.3);

        AiPromptTrace.logAnthropicWire(operation, jsonMode, system, userMessage);

        int maxAttempts = Math.max(1, properties.maxRetries());
        RestClientException lastNetwork = null;
        String lastHttpDetail = null;
        long start = System.currentTimeMillis();

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                log.info("[Anthropic] POST /v1/messages model={} tier={} op={} jsonMode={} chars={} workspaceHeader={} attempt={}/{}",
                        model, tier, operation, jsonMode, userMessage.length(),
                        properties.hasWorkspaceId(), attempt, maxAttempts);

                RestClient.RequestBodySpec request = anthropicRestClient.post()
                        .uri("/v1/messages")
                        .header("x-api-key", properties.apiKey())
                        .contentType(MediaType.APPLICATION_JSON);

                // Defensa: si el RestClient se construyó sin workspace pero ahora hay id en props
                // (p. ej. tests), asegurar el header en la request.
                if (properties.hasWorkspaceId()) {
                    request = request.header(
                            AnthropicRestClientConfig.WORKSPACE_HEADER,
                            properties.workspaceId()
                    );
                }

                String raw = request
                        .body(body)
                        .retrieve()
                        .body(String.class);

                JsonNode root = objectMapper.readTree(raw != null ? raw : "{}");
                String text = extractText(root);
                if (text.isBlank()) {
                    throw new BadRequestException("Anthropic no devolvió contenido útil");
                }

                int inputTokens = root.path("usage").path("input_tokens").asInt(0);
                int outputTokens = root.path("usage").path("output_tokens").asInt(0);
                if (inputTokens == 0 && outputTokens == 0) {
                    inputTokens = AiUsageService.estimateTokensFromChars(system + userMessage);
                    outputTokens = AiUsageService.estimateTokensFromChars(text);
                }

                usageService.recordLlmCall(
                        operation,
                        "/anthropic/v1/messages",
                        "claude",
                        model,
                        tier,
                        System.currentTimeMillis() - start,
                        inputTokens,
                        outputTokens,
                        true,
                        null
                );

                log.info("[Anthropic] OK model={} op={} chars={} in={} out={}",
                        model, operation, text.length(), inputTokens, outputTokens);
                return text;
            } catch (RestClientResponseException ex) {
                int status = ex.getStatusCode().value();
                lastHttpDetail = "HTTP " + status + " model=" + model + ": "
                        + scrubSecrets(AiStructuredJson.truncate(ex.getResponseBodyAsString(), 300));
                log.error("[Anthropic] {}", lastHttpDetail);
                if (attempt < maxAttempts && (status == 429 || status >= 500)) {
                    sleepBackoff(attempt);
                    continue;
                }
                usageService.recordLlmCall(
                        operation, "/anthropic/v1/messages", "claude", model, tier,
                        System.currentTimeMillis() - start, null, null, false, lastHttpDetail
                );
                if (status == 400 && lastHttpDetail.toLowerCase().contains("workspace")) {
                    throw new BadRequestException(
                            "Error Anthropic: falta ANTHROPIC_WORKSPACE_ID. "
                                    + "Con API keys ligadas a identidad debes definir el workspace "
                                    + "(header anthropic-workspace-id) y reiniciar el backend."
                    );
                }
                throw new BadRequestException("Error Anthropic " + lastHttpDetail);
            } catch (BadRequestException ex) {
                usageService.recordLlmCall(
                        operation, "/anthropic/v1/messages", "claude", model, tier,
                        System.currentTimeMillis() - start, null, null, false, ex.getMessage()
                );
                throw ex;
            } catch (RestClientException ex) {
                lastNetwork = ex;
                log.error("[Anthropic] Error de red/timeout attempt={}: {}", attempt, ex.getMessage());
                if (attempt < maxAttempts) {
                    sleepBackoff(attempt);
                    continue;
                }
            } catch (Exception ex) {
                usageService.recordLlmCall(
                        operation, "/anthropic/v1/messages", "claude", model, tier,
                        System.currentTimeMillis() - start, null, null, false, ex.getMessage()
                );
                throw new BadRequestException("Error parseando respuesta Anthropic: " + ex.getMessage());
            }
        }

        String err = lastHttpDetail != null
                ? lastHttpDetail
                : (lastNetwork != null ? lastNetwork.getMessage() : "reintentos agotados");
        usageService.recordLlmCall(
                operation, "/anthropic/v1/messages", "claude", model, tier,
                System.currentTimeMillis() - start, null, null, false, err
        );
        throw new BadRequestException("No se pudo contactar Anthropic: " + err);
    }

    private static String extractText(JsonNode root) {
        JsonNode content = root.path("content");
        if (!content.isArray()) {
            return "";
        }
        StringBuilder sb = new StringBuilder();
        for (JsonNode block : content) {
            if ("text".equals(block.path("type").asText()) || block.has("text")) {
                String t = block.path("text").asText("");
                if (!t.isBlank()) {
                    if (!sb.isEmpty()) {
                        sb.append('\n');
                    }
                    sb.append(t);
                }
            }
        }
        return sb.toString().trim();
    }

    private static String scrubSecrets(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        // Nunca filtrar hacia logs valores de API key / workspace id si el body los repitiera
        return raw
                .replaceAll("(?i)sk-ant-[A-Za-z0-9_\\-]+", "[omitido]")
                .replaceAll("(?i)(\"workspace[_-]id\"\\s*:\\s*\")[^\"]+\"", "$1[omitido]\"");
    }

    private static void sleepBackoff(int attempt) {
        try {
            Thread.sleep(200L * attempt);
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
        }
    }

    private void ensureConfigured() {
        if (!properties.hasApiKey()) {
            throw new BadRequestException(
                    "Anthropic no está configurado. Define ANTHROPIC_API_KEY y APP_AI_PROVIDER=anthropic (o claude)."
            );
        }
    }
}
