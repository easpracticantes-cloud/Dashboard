package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotResponse;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.domain.ai.port.out.ConversationMemoryPort;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Ave — chat abierto conversacional.
 * Gemini responde en lenguaje natural; si pide cotización, se calcula desde ai/catalogo/.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CopilotOrchestrator {

    private static final String SYSTEM = """
            Eres Ave, asistente conversacional de Escuela Aves Salento (SIG).
            Eres cercana, clara y profesional (español colombiano). No suenas a robot ni a menú de opciones.

            Personalidad:
            - Hablas como una compañera del equipo comercial/operaciones.
            - Interpretas la intención aunque escriban mal, incompleto o informal.
            - Si falta un dato importante, preguntas UNA sola cosa concreta.
            - Puedes conversar de cualquier tema del negocio: tours, precios, jeep, clientes, WhatsApp,
              reservas, procesos del SIG, proveedores, tips comerciales, dudas del día a día.
            - No inventes precios. Si hablas de tarifas, usa SOLO el catálogo adjunto (escala por pax).
            - Si no está en el catálogo, dilo con honestidad y ofrece anotar la tarifa faltante.

            Reglas operativas útiles (si aplican):
            - Jeep: >4 personas suele privado; ≤4 público.
            - Guías no pagan entrada; sí pagan almuerzo cuando hay restaurante.
            - Modalidades PRIVADO y COMPARTIDO.

            Cómo responder:
            - Por defecto: texto natural (markdown ligero). NO uses listas de “elige 1/2/3” salvo que el usuario lo pida.
            - Si el usuario quiere un precio/cotización y ya tienes tour + personas (o puedes inferirlos),
              responde SOLO con este JSON (sin fences):
              {"mode":"QUOTE","message":"<frase completa con tour y personas>"}
            - Si quiere proveedores: {"mode":"PROVIDERS","tourCode":"CODIGO","category":null}
            - En cualquier otro caso responde texto libre, sin JSON.

            Catálogo (referencia; no inventes montos fuera de aquí):
            """;

    private static final Pattern CLEAR_QUOTE = Pattern.compile(
            "(cotiz|precio|cu[aá]nto|tarifa|presupuesto|vale (para|por)|cu[aá]nto (cuesta|sale|vale))",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern HAS_PEOPLE = Pattern.compile(
            "(\\d{1,3})\\s*(personas?|pax|gente)|para\\s+(\\d{1,3})",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private final AiProviderFactory aiProviderFactory;
    private final CatalogQuoteService catalogQuoteService;
    private final RecommendationPort recommendationPort;
    private final CommercialCatalogService commercialCatalog;
    private final ConversationMemoryPort memoryPort;
    private final AiObservabilityPort observabilityPort;
    private final ObjectMapper objectMapper;

    public CopilotResponse chat(CopilotRequest request) {
        long start = System.currentTimeMillis();
        boolean success = true;
        String error = null;
        String usedProvider = "local";
        String sessionId = "ephemeral";
        try {
            if (request == null || request.message() == null || request.message().isBlank()) {
                throw new BadRequestException("Escribe un mensaje para Ave");
            }
            try {
                usedProvider = aiProviderFactory.activeType().id();
            } catch (Exception ignored) {
                usedProvider = "local";
            }
            final String sid = softSession(request.sessionId());
            sessionId = sid;
            String userMsg = request.message().trim();
            softAppend(sid, "user", userMsg);

            CopilotResponse response;
            try {
                response = converse(sid, userMsg);
            } catch (Exception ex) {
                log.warn("[Ave] Gemini falló, fallback local: {}", ex.getMessage());
                response = localFallback(sid, userMsg);
            }
            usedProvider = response.provider() != null ? response.provider() : usedProvider;
            softAppend(sid, "assistant", response.reply());
            return response;
        } catch (BadRequestException ex) {
            success = false;
            error = ex.getMessage();
            return new CopilotResponse(sessionId, ex.getMessage(), "ANSWER", List.of("error"), "local", false);
        } catch (RuntimeException ex) {
            success = false;
            error = ex.getMessage();
            log.error("[Ave] error: {}", ex.getMessage());
            return localFallback(sessionId, request != null ? request.message() : "");
        } finally {
            try {
                observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                        null, "/api/v1/ai/copilot", "copilot", usedProvider, null,
                        System.currentTimeMillis() - start, null, success, error
                ));
            } catch (Exception obsEx) {
                log.warn("[Ave] obs omitido: {}", obsEx.getMessage());
            }
        }
    }

    private CopilotResponse converse(String sessionId, String message) {
        String provider = aiProviderFactory.activeType().id();
        GenerativeAiPort ai = aiProviderFactory.getActiveProvider();

        String catalog = commercialCatalog.buildPromptIndex(90);
        String snippets = commercialCatalog.retrieveSnippets(message, 6).stream()
                .collect(Collectors.joining("\n"));
        String history = softHistory(sessionId);

        String system = SYSTEM + catalog
                + (snippets.isBlank() ? "" : "\n\nFragmentos más cercanos al mensaje:\n" + snippets);

        String raw = ai.chat(
                system,
                "Historial:\n" + history + "\n\nUsuario ahora:\n" + message
        );

        // Si Gemini devolvió JSON de herramienta
        JsonNode plan = tryParseTool(raw);
        if (plan != null) {
            String mode = plan.path("mode").asText("ANSWER").toUpperCase(Locale.ROOT);
            return switch (mode) {
                case "QUOTE" -> doQuote(sessionId, plan.path("message").asText(message), provider);
                case "PROVIDERS" -> doProviders(
                        sessionId,
                        blankToNull(plan.path("tourCode").asText(null)),
                        blankToNull(plan.path("category").asText(null)),
                        provider
                );
                default -> {
                    String reply = plan.path("reply").asText("");
                    if (reply.isBlank()) {
                        reply = stripJsonFences(raw);
                    }
                    yield new CopilotResponse(sessionId, reply, "ANSWER", List.of(), provider, true);
                }
            };
        }

        // Texto libre conversacional
        String text = stripJsonFences(raw);
        if (text.isBlank()) {
            return localFallback(sessionId, message);
        }

        // Si el usuario pidió precio de forma clara y Gemini no cotizó, cotizamos nosotros
        if (CLEAR_QUOTE.matcher(message).find() && HAS_PEOPLE.matcher(message).find()) {
            var maybe = catalogQuoteService.tryQuote(message);
            if (maybe.isPresent()) {
                String blended = text + "\n\n---\n\n" + maybe.get().markdown();
                return new CopilotResponse(sessionId, blended, "QUOTE", List.of("catalog-quote"), provider, true);
            }
        }

        return new CopilotResponse(sessionId, text, "ANSWER", List.of(), provider, true);
    }

    private CopilotResponse doQuote(String sessionId, String message, String provider) {
        try {
            CatalogQuoteService.QuoteResult q = catalogQuoteService.quote(message);
            return new CopilotResponse(sessionId, q.markdown(), "QUOTE",
                    List.of("catalog-quote", q.code()), provider, true);
        } catch (Exception ex) {
            log.warn("[Ave] cotización: {}", ex.getMessage());
            String soft = """
                    No encontré esa tarifa exacta en el catálogo de archivos.
                    Dime el nombre del tour (ej. Acaime, Rafting, Parapente) y cuántas personas.
                    Si el tour falta en `ai/catalogo/productos.json`, lo agregamos después.
                    """;
            return new CopilotResponse(sessionId, soft.trim(), "ANSWER", List.of("quote-miss"), provider, true);
        }
    }

    private CopilotResponse doProviders(String sessionId, String tour, String category, String provider) {
        try {
            var list = recommendationPort.suggest(tour, category);
            if (list.isEmpty()) {
                list = commercialCatalog.suggestProviders(tour, category).stream()
                        .map(p -> new RecommendationPort.ProviderRecommendation(
                                p.code(), p.name(), p.category(), p.tourCode(), p.notes(), p.priority()))
                        .toList();
            }
            String body = list.isEmpty()
                    ? "No tengo proveedores cargados para ese filtro. ¿Qué tour buscas?"
                    : list.stream()
                    .map(p -> "• **" + p.name() + "** (" + p.category() + ")"
                            + (p.notes() != null && !p.notes().isBlank() ? " — " + p.notes() : ""))
                    .collect(Collectors.joining("\n"));
            return new CopilotResponse(sessionId, "Te sugiero estos proveedores:\n\n" + body,
                    "PROVIDERS", List.of(), provider, true);
        } catch (Exception ex) {
            return new CopilotResponse(sessionId,
                    "No pude listar proveedores ahora. ¿Me dices el tour?",
                    "ANSWER", List.of(), "local", false);
        }
    }

    private CopilotResponse localFallback(String sessionId, String message) {
        if (message != null && CLEAR_QUOTE.matcher(message).find()) {
            return catalogQuoteService.tryQuote(message)
                    .map(q -> new CopilotResponse(sessionId, q.markdown(), "QUOTE",
                            List.of("catalog-quote-local"), "local", true))
                    .orElseGet(() -> new CopilotResponse(sessionId,
                            "Puedo cotizarte si me dices el tour y el número de personas. "
                                    + "Ejemplo: “Acaime para 4 personas, privado”.",
                            "ANSWER", List.of("fallback"), "local", true));
        }
        return new CopilotResponse(sessionId,
                "Estoy un poco lenta con el modelo ahora. Cuéntame de nuevo qué necesitas "
                        + "(cotización, duda de un tour, jeep, proveedores…) y te ayudo.",
                "ANSWER", List.of("fallback"), "local", true);
    }

    private JsonNode tryParseTool(String raw) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.startsWith("```")) {
            int firstNl = trimmed.indexOf('\n');
            int lastFence = trimmed.lastIndexOf("```");
            if (firstNl > 0 && lastFence > firstNl) {
                trimmed = trimmed.substring(firstNl + 1, lastFence).trim();
            }
        }
        if (!trimmed.startsWith("{")) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(trimmed);
            if (node.has("mode")) {
                return node;
            }
        } catch (Exception ignored) {
            // not a tool payload
        }
        return null;
    }

    private static String stripJsonFences(String raw) {
        if (raw == null) {
            return "";
        }
        String t = raw.trim();
        if (t.startsWith("```")) {
            int firstNl = t.indexOf('\n');
            int lastFence = t.lastIndexOf("```");
            if (firstNl > 0 && lastFence > firstNl) {
                t = t.substring(firstNl + 1, lastFence).trim();
            }
        }
        return t;
    }

    private String softSession(String sessionId) {
        try {
            return ensureSession(sessionId);
        } catch (Exception ex) {
            return "ephemeral-" + java.util.UUID.randomUUID().toString().replace("-", "");
        }
    }

    private void softAppend(String sessionId, String role, String content) {
        if (sessionId == null || sessionId.startsWith("ephemeral")) {
            return;
        }
        try {
            memoryPort.appendMessage(sessionId, role, content);
        } catch (Exception ex) {
            log.debug("[Ave] memoria omitida: {}", ex.getMessage());
        }
    }

    private String softHistory(String sessionId) {
        if (sessionId == null || sessionId.startsWith("ephemeral")) {
            return "(sin historial previo)";
        }
        try {
            return memoryPort.recentMessages(sessionId, 16).stream()
                    .map(m -> m.role() + ": " + m.content())
                    .collect(Collectors.joining("\n"));
        } catch (Exception ex) {
            return "(sin historial previo)";
        }
    }

    private String ensureSession(String sessionId) {
        if (sessionId != null && !sessionId.isBlank() && memoryPort.findSession(sessionId).isPresent()) {
            return sessionId;
        }
        return memoryPort.startSession(null, "Ave copiloto");
    }

    private static String blankToNull(String s) {
        if (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) {
            return null;
        }
        return s;
    }
}
