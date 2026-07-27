package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.QuoteEntity;

/**
 * Puerto de salida para renderizar una cotización como documento PDF.
 */
public interface QuotePdfPort {

    byte[] render(QuoteEntity quote);
}
