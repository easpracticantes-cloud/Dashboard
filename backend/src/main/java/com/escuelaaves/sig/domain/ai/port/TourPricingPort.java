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

    List<TourPrice> findAllActive();
}
