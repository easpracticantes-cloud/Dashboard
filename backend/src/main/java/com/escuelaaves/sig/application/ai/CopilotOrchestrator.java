package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotResponse;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.domain.ai.port.out.ConversationMemoryPort;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.escuelaaves.sig.infrastructure.ai.support.AiPromptTrace;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Ave — asistente de propósito general.
 * Flujo: mensaje → Claude siempre. El SIG (catálogo/tools) se adjunta solo si el turno es de negocio.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CopilotOrchestrator {

    private static final Pattern CLEAR_QUOTE = Pattern.compile(
            "(cotiz|precio|cu[aá]nto|tarifa|presupuesto|vale (para|por)|cu[aá]nto (cuesta|sale|vale))",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern HAS_PEOPLE = Pattern.compile(
            "(\\d{1,3})\\s*(personas?|pax|gente)|para\\s+(\\d{1,3})",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern SECRET_LEAK = Pattern.compile(
            "(?i)(sk-ant-|AIza|Bearer\\s+[A-Za-z0-9_\\-.]{20,}|api[_-]?key\\s*[:=]\\s*\\S+)"
    );

    private final AiProviderFactory aiProviderFactory;
    private final CatalogQuoteService catalogQuoteService;
    private final RecommendationPort recommendationPort;
    private final CommercialCatalogService commercialCatalog;
    private final ContextRetriever contextRetriever;
    private final SessionSlotStore sessionSlotStore;
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
            String userMsg = sanitizeUserInput(request.message().trim());

            // Historial ANTES de persistir este turno: el mensaje actual no debe
            // ir en history y de nuevo en "Usuario ahora" (ni marcar historyPresent
            // en conversaciones nuevas).
            CopilotResponse response;
            try {
                response = converse(sid, userMsg);
            } catch (Exception ex) {
                String failedProvider = resolveFailedProviderLabel(ex);
                log.warn("[Ave] {} falló: {}", failedProvider, scrubLogMessage(ex.getMessage()));
                response = recoverFromLlmFailure(sid, userMsg, ex);
            }
            response = sanitizeResponse(response);
            usedProvider = response.provider() != null ? response.provider() : usedProvider;
            if (!response.success()) {
                success = false;
                error = response.reply();
            }
            softAppend(sid, "user", userMsg);
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
            return providerFailureReply(sessionId, ex);
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

    /**
     * Ejecuta el chat y emite deltas de texto (revelado progresivo) + evento final.
     */
    public void chatStreaming(CopilotRequest request, Consumer<String> onDelta, Consumer<CopilotResponse> onDone) {
        CopilotResponse full = chat(request);
        String reply = full.reply() != null ? full.reply() : "";
        int step = Math.max(8, reply.length() / 40);
        for (int i = 0; i < reply.length(); i += step) {
            int end = Math.min(reply.length(), i + step);
            onDelta.accept(reply.substring(i, end));
            try {
                Thread.sleep(12);
            } catch (InterruptedException ie) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        onDone.accept(full);
    }

    private CopilotResponse converse(String sessionId, String message) {
        String requestId = AiPromptTrace.newRequestId();
        AiPromptTrace.begin(requestId);
        try {
            var slots = sessionSlotStore.getOrCreate(sessionId);
            boolean businessTurn = SigTopicDetector.needsBusinessContext(message);

            String catalog = "";
            String slotsJson = "";
            if (businessTurn) {
                slots.merge(HeuristicQuoteInterpreter.interpret(message));
                catalog = contextRetriever.buildCompactContext(message, slots, 6, 3);
                slotsJson = slots.toPromptJson();
            }

            String history = softHistory(sessionId);
            AvePromptAssembler.Assembled assembled = AvePromptAssembler.assemble(
                    message, history, businessTurn, catalog, slotsJson
            );

            AiPromptTrace.logRoot(requestId, sessionId, "pending", assembled, false);

            // Guardrail: identidad comercial en SYSTEM en turno general = bug de ensamblado
            if (!businessTurn && assembled.commercialIdentityInSystem()) {
                log.error("[AI-ROOT-TRACE] BUG commercial identity in general SYSTEM sources={} → force clean",
                        assembled.systemSources());
                assembled = AvePromptAssembler.assemble(message, "(sin historial previo)", false, null, null);
                AiPromptTrace.logRoot(requestId + "-clean", sessionId, "pending", assembled, false);
            }

            String operation = businessTurn && CLEAR_QUOTE.matcher(message).find() && message.length() > 400
                    ? "complex_chat" : "chat";

            ChatAttempt attempt = chatWithProviderFailover(assembled.system(), assembled.user(), operation);
            String provider = attempt.providerId();
            String raw = attempt.text();

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

            String text = stripJsonFences(raw);
            if (text.isBlank()) {
                throw new BadRequestException("El modelo de IA devolvió una respuesta vacía");
            }

            // Si el modelo vuelve a la persona comercial en turno general: un reintento limpio sin historial
            if (!businessTurn && AvePromptAssembler.looksLikeCommercialRefusal(text)) {
                log.warn("[AI-ROOT-TRACE] requestId={} commercialRefusalInReply → retry without history", requestId);
                AvePromptAssembler.Assembled retry = AvePromptAssembler.assemble(
                        message, "(sin historial previo)", false, null, null
                );
                AiPromptTrace.logRoot(requestId + "-retry", sessionId, provider, retry, false);
                ChatAttempt second = chatWithProviderFailover(retry.system(), retry.user(), "chat");
                String retryText = stripJsonFences(second.text());
                if (!retryText.isBlank() && !AvePromptAssembler.looksLikeCommercialRefusal(retryText)) {
                    return new CopilotResponse(sessionId, retryText, "ANSWER",
                            List.of("general-retry"), second.providerId(), true);
                }
            }

            if (CLEAR_QUOTE.matcher(message).find() && HAS_PEOPLE.matcher(message).find()) {
                var maybe = catalogQuoteService.tryQuote(message);
                if (maybe.isPresent()) {
                    CatalogQuoteService.QuoteResult q = maybe.get();
                    String blended = text + "\n\n---\n\n" + q.markdown();
                    return quoteResponse(sessionId, blended, List.of("catalog-quote"), provider, q);
                }
            }

            return new CopilotResponse(sessionId, text, "ANSWER", List.of(), provider, true);
        } finally {
            AiPromptTrace.end();
        }
    }

    /**
     * Llama al proveedor activo; si falla por error de API/red, reintenta con otro READY.
     */
    private ChatAttempt chatWithProviderFailover(String system, String userPayload, String operation) {
        GenerativeAiPort primary = aiProviderFactory.getActiveProvider();
        try {
            String text = primary.chat(system, userPayload, operation);
            return new ChatAttempt(primary.providerId(), text);
        } catch (Exception primaryEx) {
            var alt = aiProviderFactory.findAlternateReady(primary);
            if (alt.isEmpty()) {
                throw primaryEx instanceof RuntimeException re ? re
                        : new BadRequestException(primaryEx.getMessage());
            }
            GenerativeAiPort secondary = alt.get();
            log.warn("[Ave] Failover runtime {} → {} por: {}",
                    primary.providerId(), secondary.providerId(), scrubLogMessage(primaryEx.getMessage()));
            try {
                String text = secondary.chat(system, userPayload, operation);
                return new ChatAttempt(secondary.providerId(), text);
            } catch (Exception secondaryEx) {
                log.error("[Ave] También falló proveedor '{}': {}",
                        secondary.providerId(), scrubLogMessage(secondaryEx.getMessage()));
                throw secondaryEx instanceof RuntimeException re ? re
                        : new BadRequestException(secondaryEx.getMessage());
            }
        }
    }

    private record ChatAttempt(String providerId, String text) {}

    private CopilotResponse doQuote(String sessionId, String message, String provider) {
        try {
            CatalogQuoteService.QuoteResult q = catalogQuoteService.quote(message);
            return quoteResponse(sessionId, q.markdown(), List.of("catalog-quote", q.code()), provider, q);
        } catch (Exception ex) {
            log.warn("[Ave] cotización: {}", ex.getMessage());
            String soft = """
                    No encontré esa tarifa exacta en el catálogo.
                    Dime el nombre del tour (ej. Acaime, Rafting, Parapente) y cuántas personas.
                    Si el tour falta en el catálogo, lo podemos agregar después — no inventaré un precio.
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

    /**
     * Si el LLM falló y el mensaje era una cotización clara, intenta catálogo determinístico.
     * En cualquier otro caso: error técnico honesto (nunca fingir menú tour/jeep/proveedores).
     */
    private CopilotResponse recoverFromLlmFailure(String sessionId, String message, Exception ex) {
        if (message != null && CLEAR_QUOTE.matcher(message).find()) {
            var quoted = catalogQuoteService.tryQuote(message);
            if (quoted.isPresent()) {
                return quoteResponse(sessionId, quoted.get().markdown(),
                        List.of("catalog-quote-local"), "local", quoted.get());
            }
        }
        return providerFailureReply(sessionId, ex);
    }

    private CopilotResponse providerFailureReply(String sessionId, Exception ex) {
        return new CopilotResponse(
                sessionId,
                friendlyProviderError(ex),
                "ANSWER",
                List.of("provider-error"),
                "local",
                false
        );
    }

    private static String friendlyProviderError(Exception ex) {
        String msg = ex != null && ex.getMessage() != null ? ex.getMessage() : "";
        msg = SECRET_LEAK.matcher(msg).replaceAll("[omitido]");
        String lower = msg.toLowerCase(Locale.ROOT);
        if (lower.contains("workspace") || lower.contains("anthropic-workspace-id")
                || lower.contains("anthropic_workspace_id")) {
            return "Claude/Anthropic rechazó la petición: falta configurar ANTHROPIC_WORKSPACE_ID "
                    + "(necesario con API keys ligadas a identidad). Un administrador debe definirlo "
                    + "en el entorno del backend y reiniciar el servicio.";
        }
        if (lower.contains("no está configurado")
                || lower.contains("no hay proveedor")
                || lower.contains("api key")
                || lower.contains("define la variable")) {
            return "No puedo responder ahora: el proveedor de IA no está configurado. "
                    + "Un administrador debe definir ANTHROPIC_API_KEY (recomendado, APP_AI_PROVIDER=anthropic) "
                    + "y, si aplica, ANTHROPIC_WORKSPACE_ID; o GEMINI_API_KEY, y reiniciar el backend.";
        }
        if (lower.contains("timeout") || lower.contains("timed out") || lower.contains("i/o error")) {
            return "Hubo un problema temporal de conexión con el modelo de IA (tiempo de espera). "
                    + "Inténtalo de nuevo en unos segundos.";
        }
        if (lower.contains("429") || lower.contains("rate") || lower.contains("resource_exhausted")) {
            return "El proveedor de IA está saturado en este momento. Espera un momento e inténtalo otra vez.";
        }
        if (lower.contains("404") || lower.contains("not found") || lower.contains("ningún modelo")) {
            return "Hubo un problema con el modelo de IA configurado (modelo no disponible). "
                    + "Revisa GEMINI_MODEL / modelos Anthropic y las claves API, luego reintenta.";
        }
        return "Hubo un problema temporal al contactar el modelo de IA. Inténtalo nuevamente en un momento. "
                + "Si continúa, revisa APP_AI_PROVIDER y las claves API en el entorno del servidor.";
    }

    private CopilotResponse quoteResponse(
            String sessionId,
            String reply,
            List<String> tools,
            String provider,
            CatalogQuoteService.QuoteResult q
    ) {
        return new CopilotResponse(
                sessionId,
                reply,
                "QUOTE",
                tools,
                provider,
                true,
                catalogQuoteService.toDraft(q)
        );
    }

    private CopilotResponse sanitizeResponse(CopilotResponse response) {
        if (response == null || response.reply() == null) {
            return response;
        }
        String cleaned = SECRET_LEAK.matcher(response.reply()).replaceAll("[omitido]");
        if (cleaned.equals(response.reply())) {
            return response;
        }
        return new CopilotResponse(
                response.sessionId(),
                cleaned,
                response.mode(),
                response.toolsUsed(),
                response.provider(),
                response.success(),
                response.quoteDraft()
        );
    }

    private static String sanitizeUserInput(String message) {
        if (message.length() > 8000) {
            return message.substring(0, 8000) + "…";
        }
        return message;
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
            // Últimos 12 turnos; truncar contenido largo para controlar tokens
            return memoryPort.recentMessages(sessionId, 12).stream()
                    .map(m -> {
                        String c = AveHistorySanitizer.sanitizeTurn(m.role(), m.content());
                        if (c.length() > 600) {
                            c = c.substring(0, 500) + "…";
                        }
                        return m.role() + ": " + c;
                    })
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

    private String resolveFailedProviderLabel(Exception ex) {
        String msg = ex != null && ex.getMessage() != null ? ex.getMessage().toLowerCase(Locale.ROOT) : "";
        if (msg.contains("anthropic") || msg.contains("claude") || msg.contains("workspace")) {
            return "Claude/Anthropic";
        }
        if (msg.contains("gemini")) {
            return "Gemini";
        }
        try {
            return "Proveedor IA (" + aiProviderFactory.activeType().id() + ")";
        } catch (Exception ignored) {
            return "Proveedor IA";
        }
    }

    private static String scrubLogMessage(String message) {
        if (message == null) {
            return "";
        }
        return SECRET_LEAK.matcher(message).replaceAll("[omitido]");
    }
}
