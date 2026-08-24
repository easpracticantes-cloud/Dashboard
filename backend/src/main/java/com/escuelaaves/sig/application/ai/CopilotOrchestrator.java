package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.ActionPlanOutcome;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.domain.ai.port.out.ChecklistPort;
import com.escuelaaves.sig.domain.ai.port.out.ConversationMemoryPort;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

/**
 * Copiloto "Ave": chat abierto con Gemini. Interpreta intención libremente;
 * precios solo desde archivos {@code ai/catalogo/}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CopilotOrchestrator {

    private static final String SYSTEM = """
            Eres "Ave", el copiloto conversacional de Escuela Aves Salento (SIG).
            Hablas en español colombiano: cercano, claro, profesional y natural.

            Cómo conversas:
            - Chat ABIERTO: interpreta lo que la persona quiere aunque no use palabras exactas.
            - No suenes a menú de opciones ni a FAQ. Responde al mensaje concreto.
            - Si falta un dato para cotizar (tour, personas, privado/compartido), pregunta solo lo necesario.
            - Puedes hablar de tours, precios, jeep, proveedores, CRM, WhatsApp, reservas, procesos del equipo.
            - Nunca inventes precios. Usa SOLO el catálogo de archivos adjunto (escala por pax).
            - Si un tour/precio no está en el catálogo, dilo con honestidad.

            Contexto empresa:
            - Turismo de naturaleza / birdwatching en Salento y Quindío (Colombia).
            - Modalidades PRIVADO y COMPARTIDO. Regla jeep: >4 pax suele privado; ≤4 público.
            - Guías no pagan entrada; sí pagan almuerzo cuando aplica.
            - SIG: Dashboard, Seguimiento (WhatsApp), Clientes, Cotizaciones, Reservas, Ventas, Analítica, Reportes, Usuarios.

            Formato de salida — preferible JSON (sin markdown fences). Si no aplica herramienta, responde ANSWER:
            {"mode":"ANSWER","reply":"<respuesta natural en markdown ligero>"}
            {"mode":"QUOTE","message":"<texto completo para cotizar, con tour + personas + extras>"}
            {"mode":"CHECKLIST","tourCode":"ACAIME"}
            {"mode":"PROVIDERS","tourCode":"ACAIME","category":null}
            {"mode":"ACTIONS","instruction":"...","dryRun":true}

            Usa QUOTE cuando pidan precio/cotización y tengas (o puedas inferir) tour y personas.
            Usa ANSWER para dudas, explicaciones, recomendaciones o cuando falten datos.
            """;

    private final AiProviderFactory aiProviderFactory;
    private final QuotationOrchestrator quotationOrchestrator;
    private final ActionOrchestrator actionOrchestrator;
    private final ChecklistPort checklistPort;
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

            // Chat abierto: siempre Gemini primero (interpreta intención).
            CopilotResponse response;
            try {
                response = routeWithLlm(sid, userMsg);
            } catch (Exception ex) {
                log.warn("[Copilot] LLM falló, softFallback: {}", ex.getMessage());
                response = softFallback(sid, userMsg);
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
            log.error("[Copilot] error inesperado: {}", ex.getMessage());
            return softFallback(sessionId, request != null ? request.message() : "");
        } finally {
            try {
                observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                        null, "/api/v1/ai/copilot", "copilot", usedProvider, null,
                        System.currentTimeMillis() - start, null, success, error
                ));
            } catch (Exception obsEx) {
                log.warn("[Copilot] no se pudo registrar uso: {}", obsEx.getMessage());
            }
        }
    }

    private String softSession(String sessionId) {
        try {
            return ensureSession(sessionId);
        } catch (Exception ex) {
            log.warn("[Copilot] memoria no disponible, sesión efímera: {}", ex.getMessage());
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
            log.warn("[Copilot] append memoria omitido: {}", ex.getMessage());
        }
    }

    private String softHistory(String sessionId) {
        if (sessionId == null || sessionId.startsWith("ephemeral")) {
            return "(sin historial)";
        }
        try {
            return memoryPort.recentMessages(sessionId, 12).stream()
                    .map(m -> m.role() + ": " + m.content())
                    .collect(Collectors.joining("\n"));
        } catch (Exception ex) {
            return "(sin historial)";
        }
    }

    private static String safeMsg(Exception ex) {
        String m = ex.getMessage();
        if (m == null || m.isBlank()) {
            return ex.getClass().getSimpleName();
        }
        return m.length() > 160 ? m.substring(0, 160) + "…" : m;
    }

    private CopilotResponse routeWithLlm(String sessionId, String message) {
        String catalog = buildTariffHint();
        String relevant = commercialCatalog.retrieveSnippets(message, 8).stream()
                .collect(Collectors.joining("\n"));
        String history = softHistory(sessionId);
        String provider = aiProviderFactory.activeType().id();
        GenerativeAiPort ai = aiProviderFactory.getActiveProvider();
        String system = SYSTEM
                + "\n\n--- CATÁLOGO DE PRECIOS (archivos; no inventes) ---\n" + catalog
                + (relevant.isBlank() ? "" : "\n--- FRAGMENTOS RELEVANTES AL MENSAJE ---\n" + relevant);
        String raw = ai.chat(
                system,
                "Historial reciente:\n" + history + "\n\nMensaje actual del usuario:\n" + message
        );
        JsonNode plan = parsePlan(raw);
        String mode = plan.path("mode").asText("ANSWER").toUpperCase(Locale.ROOT);
        return switch (mode) {
            case "QUOTE" -> handleQuote(sessionId, plan.path("message").asText(message), provider);
            case "CHECKLIST" -> handleChecklist(sessionId, plan.path("tourCode").asText("ACAIME"), provider);
            case "PROVIDERS" -> handleProviders(
                    sessionId,
                    blankToNull(plan.path("tourCode").asText(null)),
                    blankToNull(plan.path("category").asText(null)),
                    provider
            );
            case "ACTIONS" -> handleActions(sessionId, plan, message, provider);
            default -> handleAnswer(sessionId, plan, raw, provider);
        };
    }

    private CopilotResponse softFallback(String sessionId, String message) {
        // Si parece cotización, intenta motor local sin Gemini.
        String norm = normalize(message);
        if (norm.contains("cotiz") || norm.contains("precio") || norm.contains("cuanto")
                || norm.contains("tarifa") || norm.contains("presupuesto")) {
            return handleQuote(sessionId, message, "local");
        }
        String reply = """
                Ahora mismo no pude conectar con el modelo de IA. ¿Me lo dices de otra forma?
                Por ejemplo: tour + número de personas, o la duda concreta del SIG.""";
        return new CopilotResponse(sessionId, reply, "ANSWER", List.of("fallback"), "local", true);
    }

    private CopilotResponse handleAnswer(String sessionId, JsonNode plan, String raw, String provider) {
        String reply = plan.path("reply").asText("");
        if (reply.isBlank()) {
            reply = stripToText(raw);
        }
        // Si Gemini respondió texto libre (sin JSON), úsalo completo.
        if (reply.isBlank() && raw != null && !raw.trim().startsWith("{")) {
            reply = raw.trim();
        }
        if (reply.isBlank() || reply.length() < 8) {
            return softFallback(sessionId, reply);
        }
        return new CopilotResponse(sessionId, reply, "ANSWER", List.of(), provider, true);
    }

    private CopilotResponse handleQuote(String sessionId, String message, String provider) {
        try {
            QuotationResponse q = quotationOrchestrator.orchestrate(new QuotationRequest(message, true));
            String reply = """
                    Cotización lista (precios desde catálogo de archivos, no inventados):

                    **%s** · %s personas
                    Total: **%s %s**
                    Tour: %s | Transporte: %s | Restaurante: %s

                    %s
                    """.formatted(
                    q.tourName() != null ? q.tourName() : q.tour(),
                    q.people(),
                    q.total(),
                    q.currency(),
                    q.subtotalTour(),
                    q.subtotalTransport(),
                    q.subtotalRestaurant(),
                    q.quotationText() != null ? q.quotationText() : (q.emailBody() != null ? q.emailBody() : "")
            ).trim();
            List<String> tools = new ArrayList<>();
            tools.add("quotation");
            if (q.rulesApplied() != null) {
                tools.addAll(q.rulesApplied());
            }
            return new CopilotResponse(sessionId, reply, "QUOTE", tools, provider, true);
        } catch (Exception ex) {
            log.warn("[Copilot] cotización falló: {}", ex.getMessage());
            return new CopilotResponse(sessionId,
                    "No pude calcular esa cotización (" + safeMsg(ex) + "). "
                            + "Dime el tour (como aparece en el catálogo) y cuántas personas, "
                            + "o si falta una tarifa en los archivos `ai/catalogo/` lo anotamos.",
                    "ANSWER", List.of("quote-error"), "local", false);
        }
    }

    private CopilotResponse handleChecklist(String sessionId, String tour, String provider) {
        try {
            ChecklistPort.Checklist c = checklistPort.resolve(tour);
            String items = c.items().stream()
                    .map(i -> (i.required() ? "☐ " : "○ ") + i.label() + " (" + i.category() + ")")
                    .collect(Collectors.joining("\n"));
            String reply = "**" + c.title() + "**\n\n" + items;
            return new CopilotResponse(sessionId, reply, "CHECKLIST", List.of("checklist:" + tour), provider, true);
        } catch (Exception ex) {
            return new CopilotResponse(sessionId,
                    "No encontré checklist para **" + tour + "**. Puedo ayudarte igual: ¿qué tour preparas?",
                    "ANSWER", List.of(), "local", false);
        }
    }

    private CopilotResponse handleProviders(String sessionId, String tour, String category, String provider) {
        if (category != null && (category.isBlank() || "null".equalsIgnoreCase(category))) {
            category = null;
        }
        var list = recommendationPort.suggest(tour, category);
        String body = list.isEmpty()
                ? "No hay proveedores en el catálogo de archivos para ese filtro. ¿Qué tour o categoría buscas?"
                : list.stream()
                .map(p -> "• **" + p.name() + "** (" + p.category() + ") — " + (p.notes() != null ? p.notes() : ""))
                .collect(Collectors.joining("\n"));
        return new CopilotResponse(sessionId, "Proveedores sugeridos:\n\n" + body, "PROVIDERS",
                List.of(), provider, true);
    }

    private CopilotResponse handleActions(String sessionId, JsonNode plan, String fallback, String provider) {
        String instruction = plan.path("instruction").asText(fallback);
        boolean dryRun = !plan.has("dryRun") || plan.path("dryRun").asBoolean(true);
        ActionPlanOutcome outcome = actionOrchestrator.run(instruction, "{}", dryRun, !dryRun);
        String steps = outcome.results().stream()
                .map(r -> "• " + r.tool() + ": " + r.message())
                .collect(Collectors.joining("\n"));
        String reply = (dryRun ? "**Simulación** (no modificó datos)\n\n" : "**Ejecutado**\n\n")
                + (outcome.narrative() != null ? outcome.narrative() + "\n\n" : "")
                + steps;
        return new CopilotResponse(sessionId, reply, "ACTIONS",
                outcome.plan().stream().map(p -> p.tool().name()).toList(), provider, true);
    }

    private String ensureSession(String sessionId) {
        if (sessionId != null && !sessionId.isBlank() && memoryPort.findSession(sessionId).isPresent()) {
            return sessionId;
        }
        return memoryPort.startSession(null, "Ave copiloto");
    }

    private String buildTariffHint() {
        try {
            String fromCatalog = commercialCatalog.buildPromptIndex(80);
            if (fromCatalog != null && !fromCatalog.isBlank() && !commercialCatalog.products().isEmpty()) {
                return fromCatalog;
            }
            return "(catálogo vacío — agrega tarifas en ai/catalogo/productos.json)";
        } catch (Exception ex) {
            return "(tarifas no disponibles)";
        }
    }

    private JsonNode parsePlan(String raw) {
        try {
            String json = extractJson(raw);
            return objectMapper.readTree(json);
        } catch (Exception ex) {
            log.warn("[Copilot] respuesta no JSON, trato como texto libre: {}", ex.getMessage());
            return objectMapper.createObjectNode().put("mode", "ANSWER").put("reply",
                    raw != null ? raw.trim() : "");
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
        int s = trimmed.indexOf('{');
        int e = trimmed.lastIndexOf('}');
        if (s >= 0 && e > s) {
            return trimmed.substring(s, e + 1);
        }
        // Texto libre → envolver como ANSWER
        return "{\"mode\":\"ANSWER\",\"reply\":" + quote(trimmed) + "}";
    }

    private static String quote(String s) {
        return "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n") + "\"";
    }

    private static String stripToText(String raw) {
        if (raw == null) {
            return "";
        }
        String t = raw.trim();
        if (t.startsWith("{")) {
            return "";
        }
        return t;
    }

    private static String blankToNull(String s) {
        if (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) {
            return null;
        }
        return s;
    }

    private static String normalize(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT)
                .replace('á', 'a').replace('é', 'e').replace('í', 'i')
                .replace('ó', 'o').replace('ú', 'u').replace('ü', 'u')
                .trim();
    }
}
