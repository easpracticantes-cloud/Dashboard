package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import com.escuelaaves.sig.domain.ai.model.PlannedAction;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.out.ActionPlanInterpreter;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class GeminiActionPlanInterpreter implements ActionPlanInterpreter {

    private final AiProviderFactory aiProviderFactory;
    private final ObjectMapper objectMapper;

    @Override
    public InterpretedPlan interpret(String instruction, String contextJson) {
        if (instruction == null || instruction.isBlank()) {
            throw new BadRequestException("La instrucción del asistente no puede estar vacía");
        }
        String system = """
                Eres el planificador de acciones del CRM SIG (Escuela Aves Salento).
                Devuelve SOLO JSON válido:
                {"rationale":"...","actions":[{"tool":"TOOL_NAME","args":{...},"rationale":"..."}]}
                Herramientas permitidas:
                """ + catalogDescription() + """
                Reglas:
                - No inventes precios. Para cotizar usa QUOTE_NATURAL_LANGUAGE (la app calcula en PostgreSQL).
                - Prefiere FIND_OR_CREATE_CLIENT antes de CREATE_RESERVATION si solo hay teléfono/nombre.
                - CREATE_RESERVATION requiere clientId (UUID), experienceName, partySize, reservationDate (YYYY-MM-DD), amount.
                - Acciones de conversación requieren conversationId (UUID).
                - No inventes UUIDs: si faltan IDs en el contexto, omite la acción mutante y explica en rationale.
                - Máximo 5 acciones. Orden lógico.
                """;
        String user = "Instrucción:\n" + instruction
                + "\n\nContexto JSON (puede estar vacío):\n"
                + (contextJson == null || contextJson.isBlank() ? "{}" : contextJson);
        String raw = aiProviderFactory.getActiveProvider().chat(system, user, "action_plan");
        try {
            JsonNode root = objectMapper.readTree(extractJson(raw));
            String rationale = root.path("rationale").asText("");
            List<PlannedAction> actions = new ArrayList<>();
            JsonNode arr = root.path("actions");
            if (arr.isArray()) {
                for (JsonNode node : arr) {
                    String toolName = node.path("tool").asText("");
                    try {
                        ActionToolType type = ActionToolType.from(toolName);
                        Map<String, Object> args = toMap(node.path("args"));
                        actions.add(new PlannedAction(type, args, node.path("rationale").asText("")));
                    } catch (Exception ex) {
                        log.warn("[ActionPlan] tool ignorado '{}': {}", toolName, ex.getMessage());
                    }
                }
            }
            return new InterpretedPlan(rationale, actions);
        } catch (BadRequestException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BadRequestException("No se pudo interpretar el plan de acciones: " + ex.getMessage());
        }
    }

    private Map<String, Object> toMap(JsonNode node) {
        Map<String, Object> map = new LinkedHashMap<>();
        if (node == null || !node.isObject()) {
            return map;
        }
        Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> e = fields.next();
            JsonNode v = e.getValue();
            if (v.isNumber()) {
                map.put(e.getKey(), v.numberValue());
            } else if (v.isBoolean()) {
                map.put(e.getKey(), v.booleanValue());
            } else if (v.isNull()) {
                // skip
            } else {
                map.put(e.getKey(), v.asText());
            }
        }
        return map;
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
}
