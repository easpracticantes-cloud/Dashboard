package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.ActionPlanOutcome;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.TourPricingPort;
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
import java.util.Optional;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Copiloto conversacional "Ave": FAQ operativa del SIG + cotización/checklist/tools.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CopilotOrchestrator {

    private static final String SYSTEM = """
            Eres "Ave", el copiloto operativo de Escuela Aves Salento (SIG).
            Hablas en español colombiano, cercano, claro y profesional. Ayudas a asesores del CRM.

            Quién eres:
            - Respondes dudas del día a día: tours, precios, jeep, checklists, clientes, WhatsApp y cómo usar el SIG.
            - Nunca inventas precios. Si no hay tarifa en el catálogo, dilo y ofrece cotizar con el motor.

            Empresa:
            - Turismo de naturaleza / birdwatching en Salento y Quindío (Colombia).
            - Tours: ACAIME (Cócora), COCORA, FILANDIA, TERMALES, CAFE.
            - Reglas: >4 personas → jeep privado; ≤4 → jeep público; guías no pagan entrada; guías sí pagan almuerzo.
            - Módulos del SIG: Dashboard, Seguimiento (WhatsApp), Clientes, Cotizaciones, Reservas, Ventas, Analítica, Reportes, Usuarios, Configuración.
            - Roles: ADMINISTRADOR, GERENCIA, COMERCIAL, CONTABILIDAD, OPERACIONES, SUPERVISOR, ASESOR.

            Cómo usar el SIG (guía corta):
            - Cotizar: menú Cotizaciones → Nueva, o pídeme "cotiza X personas tour Y".
            - Cliente: Clientes → Nuevo (nombre + teléfono). También desde Seguimiento al abrir un chat.
            - WhatsApp/inbox: Seguimiento. Puedes asignar, priorizar y responder.
            - Reserva: Reservas → Nueva (cliente + tour + fecha).
            - Ave (tú): botón flotante abajo a la derecha en cualquier pantalla.

            Formato de salida — ÚNICAMENTE JSON (sin fences):
            - FAQ / cómo usar / tips WhatsApp / explicación tours:
              {"mode":"ANSWER","reply":"<markdown ligero, 2-8 frases, actionable>"}
            - Precio o cotización concreta:
              {"mode":"QUOTE","message":"<texto útil para cotizar>"}
            - Checklist de un tour:
              {"mode":"CHECKLIST","tourCode":"ACAIME"}
            - Proveedores / guía / transporte:
              {"mode":"PROVIDERS","tourCode":"ACAIME","category":null}
            - Ejecutar en CRM (crear cliente, etc.):
              {"mode":"ACTIONS","instruction":"...","dryRun":true}
            """;

    private static final List<FaqEntry> FAQ = List.of(
            new FaqEntry(
                    List.of("hola", "buenas", "buenos dias", "buenos días", "hey", "qué tal", "que tal", "saludos"),
                    """
                    ¡Hola! Soy **Ave**, tu copiloto del SIG.
                    Pregúntame por cotizaciones, jeep, checklists, clientes o cómo usar Seguimiento/Reservas.
                    Ejemplo: *“Cotiza Acaime para 5 con transporte”*."""
            ),
            new FaqEntry(
                    List.of("jeep privado", "jeep publico", "jeep público", "transporte privado", "transporte publico"),
                    """
                    **Jeep: privado vs público**
                    • **Más de 4 personas** → jeep **privado** (grupo completo).
                    • **4 o menos** → jeep **público** (compartido).
                    Guías: no pagan entrada; sí pagan almuerzo si hay restaurante.
                    ¿Quieres que te arme la cotización con transporte?"""
            ),
            new FaqEntry(
                    List.of("como cotiz", "cómo cotiz", "crear cotizacion", "crear cotización", "nueva cotizacion", "hacer una cotizacion"),
                    """
                    **Cómo cotizar en el SIG**
                    1. Menú **Cotizaciones** → Nueva, o
                    2. Escríbeme aquí: p. ej. *“Cotiza Acaime para 5 personas con transporte y almuerzo desde Armenia”*.
                    Yo uso tarifas de PostgreSQL + reglas de negocio (jeep, guías, etc.).
                    También está la **Consola IA** (admin) con el cotizador técnico."""
            ),
            new FaqEntry(
                    List.of("que es acaime", "qué es acaime", "tour acaime", "acaime que incluye", "acaime qué incluye"),
                    """
                    **Tour Acaime** (Valle de Cócora / Salento)
                    Experiencia de naturaleza / birdwatching hacia Acaime. Suele cotizarse por persona con opciones de transporte (jeep) y restaurante/almuerzo.
                    Pregúntame *“cotiza Acaime para N personas…”* y te doy el total con precios reales del sistema."""
            ),
            new FaqEntry(
                    List.of("que es cocora", "qué es cocora", "valle de cocora", "valle de cócora"),
                    """
                    **Cócora** es el valle icónico de Salento (palmas de cera). En el SIG el tour puede aparecer como **COCORA** o empaquetado con **ACAIME** según la tarifa cargada.
                    Dime personas, pickup y si llevan transporte/almuerzo para cotizar."""
            ),
            new FaqEntry(
                    List.of("checklist", "lista de chequeo", "que llevar", "qué llevar", "preparar tour"),
                    null // routed to CHECKLIST
            ),
            new FaqEntry(
                    List.of("como crear cliente", "cómo crear cliente", "nuevo cliente", "registrar cliente"),
                    """
                    **Clientes (CRM)**
                    1. Menú **Clientes** → Nuevo.
                    2. Completa al menos **nombre** y **teléfono** (WhatsApp).
                    3. Desde **Seguimiento** también puedes vincular el chat a un cliente.
                    Si me das nombre + teléfono puedo simular/crear con el motor de acciones."""
            ),
            new FaqEntry(
                    List.of("seguimiento", "whatsapp", "inbox", "conversaciones", "como responder"),
                    """
                    **Seguimiento (inbox WhatsApp)**
                    Ahí ves chats, prioridades y asignación a asesores.
                    Tips: responde rápido, usa plantillas claras, y vincula el cliente.
                    Puedo borrarte un tono de respuesta si me pegas el mensaje del cliente."""
            ),
            new FaqEntry(
                    List.of("roles", "permisos", "administrador", "quien puede", "quién puede"),
                    """
                    **Roles del SIG**
                    ADMINISTRADOR · GERENCIA · SUPERVISOR · COMERCIAL · OPERACIONES · CONTABILIDAD · ASESOR.
                    La **Consola IA** (reglas, uso, insights) es para admin/gerencia/supervisor.
                    Ave (este chat) está disponible para el equipo operativo en cualquier pantalla."""
            ),
            new FaqEntry(
                    List.of("reserva", "como reservar", "cómo reservar", "crear reserva"),
                    """
                    **Reservas**
                    Menú **Reservas** → Nueva: elige cliente, tour, fecha y pax.
                    Antes conviene tener cotización aceptada y cliente creado.
                    ¿Quieres checklist del tour o cotización primero?"""
            ),
            new FaqEntry(
                    List.of("contraseña", "password", "olvidé", "olvide", "recuperar acceso"),
                    """
                    **Recuperar contraseña**
                    En el login usa **¿Olvidaste tu contraseña?** e ingresa el correo.
                    Te llega el enlace de restablecimiento (según configuración del servidor).
                    Si usas Google Login, entra con el Gmail autorizado."""
            ),
            new FaqEntry(
                    List.of("quien eres", "quién eres", "que puedes hacer", "qué puedes hacer", "ayuda", "que haces"),
                    """
                    Soy **Ave**, tu copiloto del SIG Escuela Aves Salento.
                    Puedo:
                    • Contestar dudas de tours, jeep, CRM y procesos
                    • Armar **cotizaciones** con precios reales
                    • Traer **checklists** y **proveedores**
                    • Orientarte a Clientes, Seguimiento, Reservas y Ventas
                    Prueba: *“¿Jeep privado o público?”* o *“Cotiza Acaime para 5”*."""
            ),
            new FaqEntry(
                    List.of("filandia", "termales", "cafe", "café", "tours disponibles", "que tours", "qué tours"),
                    """
                    **Tours habituales en el SIG**
                    • **ACAIME** / Cócora
                    • **FILANDIA**
                    • **TERMALES**
                    • **CAFE** (experiencia cafetera)
                    Dime el tour + personas + si incluyen transporte/almuerzo y te cotizo."""
            ),
            new FaqEntry(
                    List.of("consola ia", "ia enterprise", "donde esta la ia", "dónde está la ia"),
                    """
                    El chat del día a día soy **yo (Ave)**, el muñeco de abajo a la derecha.
                    La **Consola IA** (menú lateral, roles admin/gerencia) es técnica: cotizador batch, reglas, checklists, insights y logs de uso."""
            )
    );

    private static final Pattern QUOTE_HINT = Pattern.compile(
            "(cotiz|precio|cu[aá]nto (cuesta|sale|vale)|tarifa|presupuesto|vale (para|por))",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern PEOPLE_HINT = Pattern.compile(
            "(\\d+)\\s*(personas?|pax|gente)|para\\s+(\\d+)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern TOUR_HINT = Pattern.compile(
            "(acaime|cocora|c[oó]cora|filandia|termales|caf[eé])",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern CHECKLIST_HINT = Pattern.compile(
            "checklist|lista de (chequeo|verificaci[oó]n)|qu[eé] (llevar|preparar)|preparativos",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern PROVIDER_HINT = Pattern.compile(
            "proveedor|gu[ií]a|transportador|jeep(ero)?|recomienda(r)? (gu[ií]a|transporte)",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );

    private final AiProviderFactory aiProviderFactory;
    private final QuotationOrchestrator quotationOrchestrator;
    private final ActionOrchestrator actionOrchestrator;
    private final ChecklistPort checklistPort;
    private final RecommendationPort recommendationPort;
    private final TourPricingPort tourPricingPort;
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
                response = routeLocally(sid, userMsg)
                        .orElseGet(() -> routeWithLlm(sid, userMsg));
            } catch (Exception ex) {
                log.warn("[Copilot] ruta falló, softFallback: {}", ex.getMessage());
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
            return memoryPort.recentMessages(sessionId, 8).stream()
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

    private Optional<CopilotResponse> routeLocally(String sessionId, String message) {
        String norm = normalize(message);

        if (CHECKLIST_HINT.matcher(message).find() && !QUOTE_HINT.matcher(message).find()) {
            String tour = detectTourCode(message).orElse("ACAIME");
            return Optional.of(handleChecklist(sessionId, tour, "local"));
        }
        if (PROVIDER_HINT.matcher(message).find() && !QUOTE_HINT.matcher(message).find()) {
            String tour = detectTourCode(message).orElse(null);
            return Optional.of(handleProviders(sessionId, tour, null, "local"));
        }
        if (QUOTE_HINT.matcher(message).find() && (PEOPLE_HINT.matcher(message).find() || TOUR_HINT.matcher(message).find())) {
            return Optional.of(handleQuote(sessionId, message, "local"));
        }

        for (FaqEntry faq : FAQ) {
            if (faq.reply() == null) {
                continue;
            }
            for (String key : faq.keys()) {
                if (norm.contains(normalize(key))) {
                    return Optional.of(new CopilotResponse(
                            sessionId, faq.reply().trim(), "ANSWER", List.of("faq"), "local", true
                    ));
                }
            }
        }
        return Optional.empty();
    }

    private CopilotResponse routeWithLlm(String sessionId, String message) {
        String catalog = buildTariffHint();
        String history = softHistory(sessionId);
        String provider = aiProviderFactory.activeType().id();
        try {
            GenerativeAiPort ai = aiProviderFactory.getActiveProvider();
            String raw = ai.chat(
                    SYSTEM + "\n\nTarifas conocidas (referencia PG):\n" + catalog,
                    "Historial reciente:\n" + history + "\n\nMensaje actual:\n" + message
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
        } catch (Exception ex) {
            log.warn("[Copilot] LLM falló, fallback FAQ/default: {}", ex.getMessage());
            return softFallback(sessionId, message);
        }
    }

    private CopilotResponse softFallback(String sessionId, String message) {
        String norm = normalize(message);
        for (FaqEntry faq : FAQ) {
            if (faq.reply() == null) {
                continue;
            }
            for (String key : faq.keys()) {
                if (norm.contains(normalize(key).split(" ")[0]) && key.length() > 4) {
                    return new CopilotResponse(sessionId, faq.reply().trim(), "ANSWER",
                            List.of("faq-fallback"), "local", true);
                }
            }
        }
        String reply = """
                Puedo ayudarte con esto del SIG:
                • Cotizaciones (ej: “Acaime para 5 con transporte”)
                • Checklists y proveedores
                • Jeep privado/público, clientes, reservas, Seguimiento WhatsApp
                ¿Qué necesitas exactamente?""";
        return new CopilotResponse(sessionId, reply, "ANSWER", List.of("fallback"), "local", true);
    }

    private CopilotResponse handleAnswer(String sessionId, JsonNode plan, String raw, String provider) {
        String reply = plan.path("reply").asText("");
        if (reply.isBlank()) {
            reply = stripToText(raw);
        }
        if (reply.isBlank() || reply.length() < 12) {
            return softFallback(sessionId, reply);
        }
        return new CopilotResponse(sessionId, reply, "ANSWER", List.of(), provider, true);
    }

    private CopilotResponse handleQuote(String sessionId, String message, String provider) {
        try {
            QuotationResponse q = quotationOrchestrator.orchestrate(new QuotationRequest(message, true));
            String reply = """
                    Cotización lista (precios desde PostgreSQL, no inventados):

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
                    "No pude calcular la cotización ahora (" + safeMsg(ex) + "). "
                            + "Revisa que existan tarifas del tour en PostgreSQL. "
                            + "Mientras tanto puedo ayudarte con jeep, checklist o cómo cotizar en el menú Cotizaciones.",
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
                    "No encontré checklist para **" + tour + "**. Prueba ACAIME, COCORA, FILANDIA, TERMALES o CAFE.",
                    "ANSWER", List.of(), "local", false);
        }
    }

    private CopilotResponse handleProviders(String sessionId, String tour, String category, String provider) {
        if (category != null && (category.isBlank() || "null".equalsIgnoreCase(category))) {
            category = null;
        }
        var list = recommendationPort.suggest(tour, category);
        String body = list.isEmpty()
                ? "No hay proveedores configurados para ese filtro. Revisa la Consola IA → Proveedores o carga datos en BD."
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
            String[] codes = {"ACAIME", "COCORA", "FILANDIA", "TERMALES", "CAFE"};
            StringBuilder sb = new StringBuilder();
            for (String code : codes) {
                tourPricingPort.findBestMatch(code).ifPresent(t ->
                        sb.append("- ").append(t.code()).append(" ").append(t.name())
                                .append(": ").append(t.pricePerPerson()).append(" ")
                                .append(t.currency()).append("/persona")
                                .append(" (transp ").append(t.transportPerPerson())
                                .append(", rest ").append(t.restaurantPerPerson()).append(")\n")
                );
            }
            return sb.isEmpty() ? "(sin tarifas cargadas)" : sb.toString();
        } catch (Exception ex) {
            return "(tarifas no disponibles)";
        }
    }

    private JsonNode parsePlan(String raw) {
        try {
            String json = extractJson(raw);
            return objectMapper.readTree(json);
        } catch (Exception ex) {
            log.warn("[Copilot] plan no JSON, fallback ANSWER: {}", ex.getMessage());
            return objectMapper.createObjectNode().put("mode", "ANSWER").put("reply", stripToText(raw));
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

    private static Optional<String> detectTourCode(String message) {
        String n = normalize(message);
        if (n.contains("acaime")) {
            return Optional.of("ACAIME");
        }
        if (n.contains("cocora") || n.contains("cócora")) {
            return Optional.of("COCORA");
        }
        if (n.contains("filandia")) {
            return Optional.of("FILANDIA");
        }
        if (n.contains("termales")) {
            return Optional.of("TERMALES");
        }
        if (n.contains("cafe") || n.contains("café")) {
            return Optional.of("CAFE");
        }
        return Optional.empty();
    }

    private static String normalize(String s) {
        return s == null ? "" : s.toLowerCase(Locale.ROOT)
                .replace('á', 'a').replace('é', 'e').replace('í', 'i')
                .replace('ó', 'o').replace('ú', 'u').replace('ü', 'u')
                .trim();
    }

    private static String blankToNull(String s) {
        if (s == null || s.isBlank() || "null".equalsIgnoreCase(s)) {
            return null;
        }
        return s;
    }

    private record FaqEntry(List<String> keys, String reply) {
    }
}
