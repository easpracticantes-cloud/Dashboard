package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.application.ai.CommercialCatalogService;
import com.escuelaaves.sig.application.ai.ContextRetriever;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.infrastructure.ai.config.GeminiProperties;
import com.escuelaaves.sig.infrastructure.ai.config.GeminiRestClientConfig;
import com.escuelaaves.sig.infrastructure.ai.dto.GeminiRequest;
import com.escuelaaves.sig.infrastructure.ai.dto.GeminiResponse;
import com.escuelaaves.sig.infrastructure.ai.support.AiStructuredJson;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.List;

/**
 * Adapter hexagonal hacia Google Gemini vía REST (RestClient).
 */
@Slf4j
@Primary
@Component
public class GeminiAdapter extends PromptingGenerativeAiAdapter {

    private final RestClient geminiRestClient;
    private final GeminiProperties properties;

    public GeminiAdapter(
            @Qualifier(GeminiRestClientConfig.GEMINI_REST_CLIENT) RestClient geminiRestClient,
            GeminiProperties properties,
            ObjectMapper objectMapper,
            CommercialCatalogService commercialCatalog,
            ContextRetriever contextRetriever
    ) {
        super(objectMapper, commercialCatalog, contextRetriever);
        this.geminiRestClient = geminiRestClient;
        this.properties = properties;
    }

    @Override
    public IntegrationCode code() {
        return IntegrationCode.GEMINI_AI;
    }

    @Override
    public IntegrationStatus status() {
        if (!properties.hasApiKey()) {
            return IntegrationStatus.DISABLED;
        }
        return IntegrationStatus.READY;
    }

    @Override
    public String providerId() {
        return "gemini";
    }

    @Override
    protected String generateText(String systemPrompt, String userMessage, boolean jsonMode, String operation) {
        ensureConfigured();
        if (userMessage == null || userMessage.isBlank()) {
            throw new BadRequestException("El mensaje para Gemini no puede estar vacío");
        }

        GeminiRequest body = GeminiRequest.textPrompt(systemPrompt, userMessage, jsonMode);
        List<String> models = properties.modelsToTry();
        RestClientException lastNetwork = null;
        String lastHttpDetail = null;

        for (String model : models) {
            String path = "/models/" + model + ":generateContent";
            int maxAttempts = 2;
            for (int attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    log.info("[Gemini] POST {} model={} op={} jsonMode={} chars={} attempt={}/{}",
                            path, model, operation, jsonMode, userMessage.length(), attempt, maxAttempts);

                    GeminiResponse response = geminiRestClient.post()
                            .uri(uriBuilder -> uriBuilder
                                    .path(path)
                                    .queryParam("key", properties.apiKey())
                                    .build())
                            .contentType(MediaType.APPLICATION_JSON)
                            .body(body)
                            .retrieve()
                            .body(GeminiResponse.class);

                    if (response == null) {
                        throw new BadRequestException("Gemini devolvió respuesta vacía");
                    }
                    String text = response.firstText();
                    if (text.isBlank()) {
                        log.warn("[Gemini] Sin texto útil model={}. finish/block info presente={}",
                                model, response.promptFeedback() != null);
                        throw new BadRequestException("Gemini no devolvió contenido útil");
                    }
                    log.info("[Gemini] OK model={} op={} chars={}", model, operation, text.length());
                    return text;
                } catch (RestClientResponseException ex) {
                    int status = ex.getStatusCode().value();
                    lastHttpDetail = "HTTP " + status + " model=" + model + ": "
                            + AiStructuredJson.truncate(ex.getResponseBodyAsString(), 300);
                    log.error("[Gemini] {}", lastHttpDetail);
                    if (status == 403 || status == 404) {
                        break;
                    }
                    if (attempt < maxAttempts && (status == 429 || status >= 500)) {
                        sleepBackoff(attempt);
                        continue;
                    }
                    throw new BadRequestException("Error Gemini " + lastHttpDetail);
                } catch (RestClientException ex) {
                    lastNetwork = ex;
                    log.error("[Gemini] Error de red/timeout model={} attempt={}: {}",
                            model, attempt, ex.getMessage());
                    if (attempt < maxAttempts) {
                        sleepBackoff(attempt);
                        continue;
                    }
                }
            }
        }

        if (lastHttpDetail != null) {
            throw new BadRequestException(
                    "Ningún modelo Gemini respondió. Probados: " + models + ". Último: " + lastHttpDetail
            );
        }
        throw new BadRequestException("No se pudo contactar Gemini: "
                + (lastNetwork != null ? lastNetwork.getMessage() : "reintentos agotados"));
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
                    "Gemini no está configurado. Define la variable de entorno GEMINI_API_KEY (app.ai.provider=gemini)."
            );
        }
    }
}
