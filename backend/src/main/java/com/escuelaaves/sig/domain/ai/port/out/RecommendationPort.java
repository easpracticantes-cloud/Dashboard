package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;

public interface RecommendationPort {

    List<ProviderRecommendation> suggest(String tourCode, String category);

    record ProviderRecommendation(
            String code,
            String name,
            String category,
            String tourCode,
            String notes,
            int priority
    ) {
    }
}
