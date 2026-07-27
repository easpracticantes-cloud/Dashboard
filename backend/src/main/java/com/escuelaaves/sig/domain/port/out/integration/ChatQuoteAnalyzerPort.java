package com.escuelaaves.sig.domain.port.out.integration;

import com.escuelaaves.sig.domain.model.ChatQuoteContext;
import com.escuelaaves.sig.domain.model.QuoteAnalysis;

/**
 * Puerto de salida que analiza una conversacion y propone los datos de una cotizacion.
 * La implementacion puede ser heuristica local o delegar en Claude AI cuando este conectado.
 */
public interface ChatQuoteAnalyzerPort {

    QuoteAnalysis analyze(ChatQuoteContext context);
}
