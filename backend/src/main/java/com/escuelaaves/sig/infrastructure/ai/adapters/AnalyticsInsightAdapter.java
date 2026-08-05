package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.out.AnalyticsInsightPort;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class AnalyticsInsightAdapter implements AnalyticsInsightPort {

    private final AiProviderFactory aiProviderFactory;
    private final ObjectMapper objectMapper;

    @Override
    public AnalyticsInsight generate(String context) {
        String system = """
                Genera insights comerciales para Escuela Aves Salento. SOLO JSON:
                {"summary":"...","highlights":["..."],"risks":["..."],"opportunities":["..."]}
                No inventes cifras exactas si el contexto no las trae; habla en tendencias.
                """;
        String user = (context == null || context.isBlank())
                ? "Sin métricas adicionales. Resume oportunidades tipicas de un operador de tours en Salento."
                : context;
        String raw = aiProviderFactory.getActiveProvider().chat(system, user);
        try {
            String json = raw;
            int s = raw.indexOf('{');
            int e = raw.lastIndexOf('}');
            if (s >= 0 && e > s) {
                json = raw.substring(s, e + 1);
            }
            JsonNode node = objectMapper.readTree(json);
            return new AnalyticsInsight(
                    text(node, "summary"),
                    array(node, "highlights"),
                    array(node, "risks"),
                    array(node, "opportunities")
            );
        } catch (Exception ex) {
            log.warn("[Insights] parse fallback: {}", ex.getMessage());
            return new AnalyticsInsight(raw, List.of(), List.of(), List.of());
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? "" : v.asText("");
    }

    private static List<String> array(JsonNode node, String field) {
        List<String> out = new ArrayList<>();
        JsonNode arr = node.path(field);
        if (arr.isArray()) {
            arr.forEach(n -> out.add(n.asText("")));
        }
        return out;
    }
}
