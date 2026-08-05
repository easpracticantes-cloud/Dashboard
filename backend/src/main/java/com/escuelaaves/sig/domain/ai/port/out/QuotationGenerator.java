package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;

/** Genera narrativa de cotización a partir de montos ya calculados. */
public interface QuotationGenerator {
    NaturalLanguageQuotation generateQuotationNarrative(PricedQuotation priced);
}
