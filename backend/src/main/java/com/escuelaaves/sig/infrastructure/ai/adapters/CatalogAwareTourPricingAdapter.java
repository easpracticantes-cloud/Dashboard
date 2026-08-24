package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.application.ai.CommercialCatalogService;
import com.escuelaaves.sig.application.ai.CommercialCatalogService.CatalogProduct;
import com.escuelaaves.sig.domain.ai.model.TourPrice;
import com.escuelaaves.sig.domain.ai.port.TourPricingPort;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Prioriza el catálogo JSON 2026 (escala por pax). Fallback a PostgreSQL.
 * Los precios del portafolio son venta/paquete: transporte y restaurante = 0
 * para no duplicar montos en la cotización.
 */
@Primary
@Component
@RequiredArgsConstructor
public class CatalogAwareTourPricingAdapter implements TourPricingPort {

    private final CommercialCatalogService catalog;
    private final TourPricingJpaAdapter jpaFallback;

    @Override
    public Optional<TourPrice> findByCode(String code) {
        return catalog.findByCode(code)
                .map(p -> toTourPrice(p, 1))
                .or(() -> jpaFallback.findByCode(code));
    }

    @Override
    public Optional<TourPrice> findBestMatch(String tourHint) {
        return findBestMatch(tourHint, 1);
    }

    @Override
    public Optional<TourPrice> findBestMatch(String tourHint, int people) {
        Optional<CatalogProduct> hit = catalog.findBestMatch(tourHint, detectModality(tourHint));
        if (hit.isPresent()) {
            return Optional.of(toTourPrice(hit.get(), people));
        }
        return jpaFallback.findBestMatch(tourHint);
    }

    @Override
    public List<TourPrice> findAllActive() {
        List<TourPrice> fromCatalog = catalog.products().stream()
                .filter(CatalogProduct::active)
                .map(p -> toTourPrice(p, 1))
                .toList();
        if (!fromCatalog.isEmpty()) {
            return fromCatalog;
        }
        return jpaFallback.findAllActive();
    }

    private TourPrice toTourPrice(CatalogProduct p, int people) {
        BigDecimal unit = catalog.unitPriceForPax(p, people)
                .orElse(p.pricePerPerson1Pax() != null ? p.pricePerPerson1Pax() : BigDecimal.ZERO);
        return new TourPrice(
                p.code(),
                p.name() + (p.modality() != null ? " [" + p.modality() + "]" : ""),
                unit,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                p.currency() != null ? p.currency() : "COP",
                p.active()
        );
    }

    private static String detectModality(String hint) {
        if (hint == null) {
            return null;
        }
        String n = hint.toLowerCase();
        if (n.contains("compartido") || n.contains("civitatis") || n.contains("grupo")) {
            return "COMPARTIDO";
        }
        if (n.contains("privado") || n.contains("private")) {
            return "PRIVADO";
        }
        return null;
    }
}
