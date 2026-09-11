package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDocumentResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDraftDto;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Valida y recalcula cotizaciones estructuradas. No genera HTML ni SQL.
 */
@Service
@RequiredArgsConstructor
public class QuoteDocumentService {

    private final QuoteDocumentCalculator calculator;

    public QuoteDocumentResponse process(QuoteDraftDto incoming, boolean save) {
        QuoteDraftDto document = calculator.normalize(incoming);
        List<String> errors = save
                ? calculator.validateForSave(document)
                : List.of();
        if (save && !errors.isEmpty()) {
            throw new BadRequestException(String.join(" ", errors));
        }
        if (!save) {
            errors = calculator.validateForSave(document);
        }
        return new QuoteDocumentResponse(document, errors, errors.isEmpty());
    }
}
