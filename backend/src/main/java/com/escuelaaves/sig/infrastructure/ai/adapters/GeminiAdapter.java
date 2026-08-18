package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.model.ConversationClassification;
import com.escuelaaves.sig.domain.ai.model.LanguageDetection;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;
import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.model.IntegrationCode;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.infrastructure.ai.config.GeminiProperties;
import com.escuelaaves.sig.infrastructure.ai.config.GeminiRestClientConfig;
import com.escuelaaves.sig.infrastructure.ai.dto.GeminiRequest;
import com.escuelaaves.sig.infrastructure.ai.dto.GeminiResponse;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

/**
 * Adapter hexagonal hacia Google Gemini vía REST (RestClient).
 * Única clase autorizada a hablar con la API de Gemini.
 */
@Slf4j
@Primary
@Component
public class GeminiAdapter implements GenerativeAiPort {

    private final RestClient geminiRestClient;
    private final GeminiProperties properties;
    private final ObjectMapper objectMapper;

    public GeminiAdapter(
            @Qualifier(GeminiRestClientConfig.GEMINI_REST_CLIENT) RestClient geminiRestClient,
            GeminiProperties properties,
            ObjectMapper objectMapper
    ) {
        this.geminiRestClient = geminiRestClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
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
    public String chat(String systemPrompt, String userMessage) {
        return generateText(systemPrompt, userMessage, false);
    }

    @Override
    public QuoteInterpretation interpretQuote(String message) {
        String system = """
                Eres un extractor de datos para Escuela Aves Salento (tours en Quindío, Colombia).
                Devuelve SOLO JSON válido con estas claves:
                tour (string en MAYÚSCULAS, ej ACAIME, COCORA, FILANDIA, TERMALES),
                people (integer),
                date (YYYY-MM-DD o null si no hay fecha clara; si dice "sábado" estima la próxima fecha relativa a hoy),
                pickup (ciudad de recogida o null),
                transport (boolean),
                restaurant (boolean; true si mencionan almuerzo/comida/restaurante),
                rawNotes (string breve).
                No inventes precios. No calcules montos. No agregues texto fuera del JSON.
                """;
        String json = generateText(system, message, true);
        return parseQuoteInterpretation(json, message);
    }

    @Override
    public String summarizeConversation(String conversationText) {
        return generateText(
                "Resume en español, en 2-4 frases, esta conversación comercial de WhatsApp para un asesor.",
                conversationText,
                false
        );
    }

    @Override
    public ConversationClassification classifyConversation(String conversationText) {
        String system = """
                Clasifica la conversación. Devuelve SOLO JSON:
                {"category":"...","intent":"...","urgency":"LOW|MEDIUM|HIGH","rationale":"..."}
                """;
        String json = generateText(system, conversationText, true);
        try {
            JsonNode node = objectMapper.readTree(extractJson(json));
            return new ConversationClassification(
                    text(node, "category"),
                    text(node, "intent"),
                    text(node, "urgency"),
                    text(node, "rationale")
            );
        } catch (Exception ex) {
            log.warn("No se pudo parsear clasificación: {}", ex.getMessage());
            return new ConversationClassification("UNKNOWN", "UNKNOWN", "MEDIUM", json);
        }
    }

    @Override
    public String generateEmail(String context) {
        return generateText(
                "Redacta un correo profesional en español para Escuela Aves Salento. Solo el cuerpo del correo.",
                context,
                false
        );
    }

    @Override
    public NaturalLanguageQuotation generateQuotationNarrative(PricedQuotation priced) {
        String system = """
                Genera SOLO JSON:
                {"emailSubject":"...","emailBody":"...","quotationText":"..."}
                Usa los montos dados; no los cambies. Tono cálido y profesional. Español.
                """;
        String user = """
                Tour: %s (%s)
                Personas: %s
                Fecha: %s
                Pickup: %s
                Transporte: %s
                Restaurante: %s
                Precio/persona tour: %s
                Subtotal tour: %s
                Subtotal transporte: %s
                Subtotal restaurante: %s
                TOTAL: %s %s
                """.formatted(
                priced.tourName(), priced.tourCode(),
                priced.interpretation().people(),
                priced.interpretation().date(),
                priced.interpretation().pickup(),
                priced.interpretation().transport(),
                priced.interpretation().restaurant(),
                priced.pricePerPerson(),
                priced.subtotalTour(),
                priced.subtotalTransport(),
                priced.subtotalRestaurant(),
                priced.total(),
                priced.currency()
        );
        String json = generateText(system, user, true);
        try {
            JsonNode node = objectMapper.readTree(extractJson(json));
            return new NaturalLanguageQuotation(
                    text(node, "emailSubject"),
                    text(node, "emailBody"),
                    text(node, "quotationText")
            );
        } catch (Exception ex) {
            log.warn("No se pudo parsear narrativa de cotización: {}", ex.getMessage());
            return new NaturalLanguageQuotation(
                    "Cotización Escuela Aves Salento",
                    json,
                    json
            );
        }
    }

    @Override
    public ReservationExtraction extractReservationInformation(String message) {
        String system = """
                Extrae reserva. SOLO JSON:
                {"tour":"...","people":N,"date":"YYYY-MM-DD|null","pickup":"...","notes":"..."}
                """;
        String json = generateText(system, message, true);
        try {
            JsonNode node = objectMapper.readTree(extractJson(json));
            return new ReservationExtraction(
                    text(node, "tour"),
                    intOrNull(node, "people"),
                    textOrNull(node, "date"),
                    textOrNull(node, "pickup"),
                    textOrNull(node, "notes")
            );
        } catch (Exception ex) {
            throw new BadRequestException("No se pudo extraer información de reserva: " + ex.getMessage());
        }
    }

    @Override
    public LanguageDetection detectLanguage(String text) {
        String system = """
                Detecta el idioma. SOLO JSON:
                {"languageCode":"es","languageName":"Spanish","confidence":0.0}
                """;
        String json = generateText(system, text, true);
        try {
            JsonNode node = objectMapper.readTree(extractJson(json));
            return new LanguageDetection(
                    text(node, "languageCode"),
                    text(node, "languageName"),
                    node.path("confidence").asDouble(0.5)
            );
        } catch (Exception ex) {
            return new LanguageDetection("und", "Unknown", 0.0);
        }
    }

    @Override
    public SentimentAnalysis analyzeSentiment(String text) {
        String system = """
                Analiza sentimiento comercial. SOLO JSON:
                {"sentiment":"POSITIVE|NEUTRAL|NEGATIVE","score":0.0,"intent":"...","urgency":"LOW|MEDIUM|HIGH"}
                """;
        String json = generateText(system, text, true);
        try {
            JsonNode node = objectMapper.readTree(extractJson(json));
            return new SentimentAnalysis(
                    text(node, "sentiment"),
                    node.path("score").asDouble(0.0),
                    text(node, "intent"),
                    text(node, "urgency")
            );
        } catch (Exception ex) {
            return new SentimentAnalysis("NEUTRAL", 0.0, "UNKNOWN", "MEDIUM");
        }
    }

    @Override
    public String suggestReply(String conversationText) {
        return generateText(
                "Sugiere UNA respuesta breve, cálida y profesional de WhatsApp para el asesor de Escuela Aves Salento. Solo el texto.",
                conversationText,
                false
        );
    }

    private String generateText(String systemPrompt, String userMessage, boolean jsonMode) {
        ensureConfigured();
        if (userMessage == null || userMessage.isBlank()) {
            throw new BadRequestException("El mensaje para Gemini no puede estar vacío");
        }

        String path = "/models/" + properties.model() + ":generateContent";
        GeminiRequest body = GeminiRequest.textPrompt(systemPrompt, userMessage, jsonMode);

        int maxAttempts = 3;
        RestClientException lastNetwork = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                log.info("[Gemini] POST {} model={} jsonMode={} chars={} attempt={}/{}",
                        path, properties.model(), jsonMode, userMessage.length(), attempt, maxAttempts);

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
                    log.warn("[Gemini] Sin texto útil. finish/block info presente={}", response.promptFeedback() != null);
                    throw new BadRequestException("Gemini no devolvió contenido útil");
                }
                log.info("[Gemini] OK chars={}", text.length());
                return text;
            } catch (RestClientResponseException ex) {
                int status = ex.getStatusCode().value();
                log.error("[Gemini] HTTP {} body={}", status, ex.getResponseBodyAsString());
                if (attempt < maxAttempts && (status == 429 || status >= 500)) {
                    sleepBackoff(attempt);
                    continue;
                }
                throw new BadRequestException("Error Gemini HTTP " + status + ": " + truncate(ex.getResponseBodyAsString()));
            } catch (RestClientException ex) {
                lastNetwork = ex;
                log.error("[Gemini] Error de red/timeout attempt={}: {}", attempt, ex.getMessage());
                if (attempt < maxAttempts) {
                    sleepBackoff(attempt);
                    continue;
                }
            }
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

    private QuoteInterpretation parseQuoteInterpretation(String json, String original) {
        try {
            JsonNode node = objectMapper.readTree(extractJson(json));
            return new QuoteInterpretation(
                    upperOrNull(textOrNull(node, "tour")),
                    intOrNull(node, "people"),
                    textOrNull(node, "date"),
                    textOrNull(node, "pickup"),
                    boolOrNull(node, "transport"),
                    boolOrNull(node, "restaurant"),
                    textOrNull(node, "rawNotes") != null ? textOrNull(node, "rawNotes") : original
            );
        } catch (Exception ex) {
            throw new BadRequestException("No se pudo interpretar la cotización: " + ex.getMessage());
        }
    }

    private static String extractJson(String raw) {
        if (raw == null) {
            return "{}";
        }
        String trimmed = raw.trim();
        if (trimmed.startsWith("```")) {
            int firstNl = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNl > 0 && lastFence > firstNl) {
                trimmed = trimmed.substring(firstNl + 1, lastFence).trim();
            }
        }
        int start = trimmed.indexOf('{');
        int end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            return trimmed.substring(start, end + 1);
        }
        return trimmed;
    }

    private static String text(JsonNode node, String field) {
        String v = textOrNull(node, field);
        return v == null ? "" : v;
    }

    private static String textOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        String s = v.asText("").trim();
        return s.isBlank() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private static String upperOrNull(String value) {
        return value == null ? null : value.trim().toUpperCase();
    }

    private static Integer intOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        if (v.isNumber()) {
            return v.asInt();
        }
        try {
            return Integer.parseInt(v.asText().trim());
        } catch (Exception ex) {
            return null;
        }
    }

    private static Boolean boolOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        if (v.isMissingNode() || v.isNull()) {
            return null;
        }
        if (v.isBoolean()) {
            return v.asBoolean();
        }
        String t = v.asText("").trim().toLowerCase();
        if (t.isBlank()) {
            return null;
        }
        return t.equals("true") || t.equals("si") || t.equals("sí") || t.equals("1");
    }

    private static String truncate(String value) {
        if (value == null) {
            return "";
        }
        return value.length() <= 300 ? value : value.substring(0, 300) + "...";
    }
}
