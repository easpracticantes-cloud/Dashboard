package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;

/** Interpreta lenguaje natural a estructura de cotización (sin precios). */
public interface QuotationInterpreter {
    QuoteInterpretation interpretQuote(String message);
}
