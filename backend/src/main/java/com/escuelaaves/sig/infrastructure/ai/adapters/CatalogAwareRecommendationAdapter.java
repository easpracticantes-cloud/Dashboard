package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.application.ai.CommercialCatalogService;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Proveedores del catálogo 2026 primero; fallback a PostgreSQL.
 */
@Primary
@Component
@RequiredArgsConstructor
public class CatalogAwareRecommendationAdapter implements RecommendationPort {

    private final CommercialCatalogService catalog;
    private final RecommendationJpaAdapter jpaFallback;

    @Override
    public List<ProviderRecommendation> suggest(String tourCode, String category) {
        List<ProviderRecommendation> fromCatalog = catalog.suggestProviders(tourCode, category).stream()
                .map(p -> new ProviderRecommendation(
                        p.code(), p.name(), p.category(), p.tourCode(), p.notes(), p.priority()))
                .toList();
        if (!fromCatalog.isEmpty()) {
            return fromCatalog;
        }
        return jpaFallback.suggest(tourCode, category);
    }
}
