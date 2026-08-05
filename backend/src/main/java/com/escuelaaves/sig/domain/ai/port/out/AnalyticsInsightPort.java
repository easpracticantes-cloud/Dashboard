package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

/** Insights analíticos generados con IA (no sustituyen métricas SQL). */
public interface AnalyticsInsightPort {

    AnalyticsInsight generate(String context);

    record AnalyticsInsight(
            String summary,
            List<String> highlights,
            List<String> risks,
            List<String> opportunities
    ) {
    }
}
