package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.infrastructure.ai.support.AiStructuredJson;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Interpreta la instrucción comercial del asesor vía Claude.
 * No lee WhatsApp. No inventa precios ni consecutivos.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InstructionQuoteExtractor {

    static final String SYSTEM_PROMPT = """
            Eres el asistente comercial inteligente de Escuela Aves Salento.
            Interpretas solicitudes de cotización escritas por un asesor del SIG.

            IDENTIDAD VISUAL:
            La cotización usa una plantilla protegida. Nunca cambies colores, logo,
            tipografía ni composición. Solo entregas datos JSON.

            REGLAS DE DATOS:
            - Solo usa la instrucción del asesor y los datos de cliente entregados.
            - NUNCA inventes precios, descuentos, impuestos, servicios inexistentes,
              condiciones de pago, NITs, teléfonos ni fechas no indicadas.
            - quotation.number SIEMPRE null (lo genera el SIG).
            - unitPrice, discount, tax, subtotal de cada ítem SIEMPRE null
              (los pone el catálogo SIG).
            - Redacta descriptions comerciales profesionales sin agregar
              características no confirmadas.
            - missingInformation: field, severity (CRITICAL|IMPORTANT|OPTIONAL), message.
            - confidence: HIGH|MEDIUM|LOW.
            - Por servicio: name, description, quantity, unit (pax|servicio|día),
              serviceHint (para match de catálogo), confidence, evidence.

            Responde ÚNICAMENTE con JSON válido, sin markdown.
            """;

    private final AiProviderFactory aiProviderFactory;
    private final ObjectMapper objectMapper;

    public ExtractionResult extract(String instructions, Map<String, String> clientContext) {
        if (instructions == null || instructions.isBlank()) {
            return ExtractionResult.empty("Escribe qué deseas cotizar.");
        }
        GenerativeAiPort ai = aiProviderFactory.getActiveProvider();
        IntegrationStatus status = ai.status();
        if (status != IntegrationStatus.READY && status != IntegrationStatus.CONNECTED) {
            return heuristicFallback(instructions, "IA no disponible; se usó análisis básico. Revisa los datos.");
        }
        try {
            StringBuilder clientBlock = new StringBuilder();
            if (clientContext != null) {
                clientContext.forEach((k, v) -> {
                    if (v != null && !v.isBlank()) {
                        clientBlock.append(k).append(": ").append(v).append('\n');
                    }
                });
            }
            String user = """
                    <client_context>
                    %s
                    </client_context>

                    <advisor_instructions>
                    %s
                    </advisor_instructions>

                    <task>
                    Devuelve JSON con:
                    client{name,document,company,phone,email,city,address},
                    quotation{requestedDate,validUntil,currency,number},
                    services[{name,description,quantity,unit,serviceHint,confidence,evidence}],
                    commercialConditions{paymentMethod,paymentTerms,validity},
                    notes[], missingInformation[{field,severity,message}],
                    warnings[], confidence, requestSummary
                    </task>
                    """.formatted(
                    clientBlock.isEmpty() ? "(sin datos adicionales)" : clientBlock,
                    instructions.strip());
            String raw = ai.chat(SYSTEM_PROMPT, user, "intelligentQuoteExtract");
            JsonNode node = objectMapper.readTree(AiStructuredJson.extractJson(raw));
            return parse(node, null);
        } catch (Exception ex) {
            log.warn("[InstructionQuoteExtractor] Claude falló, fallback: {}", ex.getMessage());
            return heuristicFallback(instructions, "No fue posible un análisis completo; revisa los datos pendientes.");
        }
    }

    private ExtractionResult parse(JsonNode node, String warningExtra) {
        Map<String, String> client = new LinkedHashMap<>();
        JsonNode c = node.path("client");
        put(client, "name", text(c, "name"));
        put(client, "document", text(c, "document"));
        put(client, "company", text(c, "company"));
        put(client, "phone", text(c, "phone"));
        put(client, "email", text(c, "email"));
        put(client, "city", text(c, "city"));
        put(client, "address", text(c, "address"));

        String requestedDate = text(node.path("quotation"), "requestedDate");
        String currency = text(node.path("quotation"), "currency");
        if (currency == null || currency.isBlank()) {
            currency = "COP";
        }

        List<ExtractedService> services = new ArrayList<>();
        for (JsonNode s : node.path("services")) {
            Integer qty = s.hasNonNull("quantity") && s.get("quantity").canConvertToInt()
                    ? s.get("quantity").asInt()
                    : null;
            String name = text(s, "name");
            String hint = text(s, "serviceHint");
            if (hint == null || hint.isBlank()) {
                hint = name;
            }
            services.add(new ExtractedService(
                    name,
                    text(s, "description"),
                    qty,
                    text(s, "unit") != null ? text(s, "unit") : "pax",
                    hint,
                    text(s, "confidence") != null ? text(s, "confidence") : "MEDIUM",
                    text(s, "evidence")
            ));
        }

        List<MissingItem> missing = new ArrayList<>();
        for (JsonNode m : node.path("missingInformation")) {
            missing.add(new MissingItem(
                    text(m, "field") != null ? text(m, "field") : "unknown",
                    normalizeSeverity(text(m, "severity")),
                    text(m, "message") != null ? text(m, "message") : "Información pendiente"
            ));
        }

        List<String> warnings = new ArrayList<>();
        for (JsonNode w : node.path("warnings")) {
            if (w.isTextual() && !w.asText().isBlank()) {
                warnings.add(w.asText().trim());
            }
        }
        if (warningExtra != null && !warningExtra.isBlank()) {
            warnings.add(warningExtra);
        }

        JsonNode conditions = node.path("commercialConditions");
        Map<String, String> commercial = new LinkedHashMap<>();
        put(commercial, "paymentMethod", text(conditions, "paymentMethod"));
        put(commercial, "paymentTerms", text(conditions, "paymentTerms"));
        put(commercial, "validity", text(conditions, "validity"));

        List<String> notes = new ArrayList<>();
        for (JsonNode n : node.path("notes")) {
            if (n.isTextual() && !n.asText().isBlank()) {
                notes.add(n.asText().trim());
            }
        }

        String confidence = text(node, "confidence");
        if (confidence == null) {
            confidence = services.isEmpty() ? "LOW" : "MEDIUM";
        }
        String summary = text(node, "requestSummary");

        if (services.isEmpty()) {
            missing.add(new MissingItem("servicio", "CRITICAL", "No se identificó un servicio solicitado."));
        }
        for (ExtractedService svc : services) {
            if (svc.quantity() == null || svc.quantity() <= 0) {
                missing.add(new MissingItem(
                        "cantidad",
                        "CRITICAL",
                        "Falta confirmar la cantidad para: " + (svc.name() != null ? svc.name() : "servicio")));
            }
        }

        return new ExtractionResult(
                client,
                requestedDate,
                currency,
                services,
                commercial,
                notes,
                missing,
                warnings,
                confidence.toUpperCase(Locale.ROOT),
                summary
        );
    }

    private ExtractionResult heuristicFallback(String instructions, String warning) {
        String lower = instructions.toLowerCase(Locale.ROOT);
        Integer people = null;
        var matcher = java.util.regex.Pattern
                .compile("(\\d{1,2})\\s*(?:personas|pax|participantes)", java.util.regex.Pattern.CASE_INSENSITIVE)
                .matcher(instructions);
        if (matcher.find()) {
            people = Integer.parseInt(matcher.group(1));
        }
        String hint = "avistamiento";
        if (lower.contains("cocora")) {
            hint = "cocora";
        } else if (lower.contains("acaime")) {
            hint = "acaime";
        } else if (lower.contains("privado")) {
            hint = "tour privado";
        }
        List<ExtractedService> services = List.of(new ExtractedService(
                "Experiencia de avistamiento",
                "Experiencia de avistamiento de aves según la solicitud del asesor.",
                people,
                "pax",
                hint,
                people != null ? "MEDIUM" : "LOW",
                "Heurística local"
        ));
        List<MissingItem> missing = new ArrayList<>();
        if (people == null) {
            missing.add(new MissingItem("cantidad", "CRITICAL", "Falta confirmar la cantidad de personas."));
        }
        return new ExtractionResult(
                Map.of(),
                null,
                "COP",
                services,
                Map.of(),
                List.of(),
                missing,
                List.of(warning),
                "LOW",
                instructions.strip()
        );
    }

    private static String normalizeSeverity(String raw) {
        if (raw == null) {
            return "IMPORTANT";
        }
        String s = raw.trim().toUpperCase(Locale.ROOT);
        if (s.startsWith("CRIT")) {
            return "CRITICAL";
        }
        if (s.startsWith("OPT")) {
            return "OPTIONAL";
        }
        return "IMPORTANT";
    }

    private static void put(Map<String, String> map, String key, String value) {
        if (value != null && !value.isBlank()) {
            map.put(key, value.trim());
        }
    }

    private static String text(JsonNode node, String field) {
        if (node == null || node.isMissingNode()) {
            return null;
        }
        JsonNode v = node.path(field);
        if (v.isNull() || v.isMissingNode()) {
            return null;
        }
        String t = v.asText(null);
        if (t == null || t.isBlank() || "null".equalsIgnoreCase(t)) {
            return null;
        }
        return t.trim();
    }

    public record ExtractedService(
            String name,
            String description,
            Integer quantity,
            String unit,
            String serviceHint,
            String confidence,
            String evidence
    ) {
    }

    public record MissingItem(String field, String severity, String message) {
    }

    public record ExtractionResult(
            Map<String, String> client,
            String requestedDate,
            String currency,
            List<ExtractedService> services,
            Map<String, String> commercialConditions,
            List<String> notes,
            List<MissingItem> missingInformation,
            List<String> warnings,
            String confidence,
            String requestSummary
    ) {
        static ExtractionResult empty(String message) {
            return new ExtractionResult(
                    Map.of(),
                    null,
                    "COP",
                    List.of(),
                    Map.of(),
                    List.of(),
                    List.of(new MissingItem("instrucciones", "CRITICAL", message)),
                    List.of(),
                    "LOW",
                    null
            );
        }
    }
}
