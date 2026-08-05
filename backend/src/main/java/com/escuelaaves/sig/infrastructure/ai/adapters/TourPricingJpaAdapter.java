package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.model.TourPrice;
import com.escuelaaves.sig.domain.ai.port.TourPricingPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.TourProductEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.TourProductJpaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Adapter que lee tarifas de tours desde PostgreSQL (schema sig.tour_products).
 */
@Component
@RequiredArgsConstructor
public class TourPricingJpaAdapter implements TourPricingPort {

    private final TourProductJpaRepository tourProductJpaRepository;

    @Override
    public Optional<TourPrice> findByCode(String code) {
        if (code == null || code.isBlank()) {
            return Optional.empty();
        }
        return tourProductJpaRepository.findByCodeIgnoreCase(code.trim()).map(this::toDomain);
    }

    @Override
    public Optional<TourPrice> findBestMatch(String tourHint) {
        if (tourHint == null || tourHint.isBlank()) {
            return Optional.empty();
        }
        Optional<TourPrice> exact = findByCode(tourHint);
        if (exact.isPresent()) {
            return exact;
        }
        String needle = normalize(tourHint);
        List<TourProductEntity> active = tourProductJpaRepository.findByActiveTrueOrderByNameAsc();
        return active.stream()
                .filter(e -> normalize(e.getCode()).contains(needle)
                        || normalize(e.getName()).contains(needle)
                        || keywordMatch(e.getKeywords(), needle))
                .findFirst()
                .map(this::toDomain)
                .or(() -> findByCode("ACAIME"));
    }

    @Override
    public List<TourPrice> findAllActive() {
        return tourProductJpaRepository.findByActiveTrueOrderByNameAsc().stream()
                .map(this::toDomain)
                .toList();
    }

    private boolean keywordMatch(String keywords, String needle) {
        if (keywords == null || keywords.isBlank()) {
            return false;
        }
        return Arrays.stream(keywords.split(","))
                .map(this::normalize)
                .anyMatch(token -> !token.isBlank() && (token.contains(needle) || needle.contains(token)));
    }

    private TourPrice toDomain(TourProductEntity e) {
        return new TourPrice(
                e.getCode(),
                e.getName(),
                e.getPricePerPerson(),
                e.getTransportPerPerson(),
                e.getRestaurantPerPerson(),
                e.getCurrency(),
                e.isActive()
        );
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replace("á", "a").replace("é", "e").replace("í", "i")
                .replace("ó", "o").replace("ú", "u");
    }
}
