package com.escuelaaves.sig.domain.ai.port;

import com.escuelaaves.sig.domain.ai.model.TourPrice;

import java.util.List;
import java.util.Optional;

/**
 * Puerto de lectura de tarifas de tours desde PostgreSQL.
 * La IA nunca calcula precios; este puerto es la única fuente de verdad monetaria.
 */
public interface TourPricingPort {

    Optional<TourPrice> findByCode(String code);

    Optional<TourPrice> findBestMatch(String tourHint);

    /**
     * Mejor match aplicando escala por número de personas cuando el catálogo lo permite.
     */
    default Optional<TourPrice> findBestMatch(String tourHint, int people) {
        return findBestMatch(tourHint);
    }

    List<TourPrice> findAllActive();
}
