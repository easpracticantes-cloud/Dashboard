package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDraftDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteLineItemDto;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class QuoteDocumentCalculatorTest {

    private final QuoteDocumentCalculator calculator = new QuoteDocumentCalculator();

    @Test
    void recalculatesLineAndDocumentTotalsInCop() {
        QuoteDraftDto draft = new QuoteDraftDto(
                "RAFTING",
                "Rafting",
                "PRIVADO",
                20,
                new BigDecimal("50000"),
                BigDecimal.ZERO,
                "COP",
                "2026-09-11",
                "Armenia",
                "Juan Pérez",
                null,
                null,
                null,
                false,
                Map.of(),
                List.of(
                        new QuoteLineItemDto("Transporte", 20, "pax", new BigDecimal("50000"), BigDecimal.ZERO, null, null),
                        new QuoteLineItemDto("Alojamiento", 20, "pax", new BigDecimal("120000"), BigDecimal.ZERO, null, null)
                ),
                "123",
                "3001234567",
                "juan@mail.com",
                "Armenia",
                null,
                null,
                null,
                "EAS-20260911",
                "2026-09-11",
                "2026-09-26",
                null,
                null,
                "DRAFT"
        );
        QuoteDraftDto normalized = calculator.normalize(draft);
        assertEquals(0, new BigDecimal("3400000").compareTo(normalized.total()));
        assertEquals(2, normalized.items().size());
        assertTrue(calculator.validateForSave(normalized).isEmpty());
    }

    @Test
    void rejectsSaveWithoutClientOrItems() {
        QuoteDraftDto empty = calculator.normalize(new QuoteDraftDto(
                null, null, "PRIVADO", 1, BigDecimal.ZERO, BigDecimal.ZERO, "COP",
                null, null, null, null, null, null, false, Map.of()
        ));
        List<String> errors = calculator.validateForSave(empty);
        assertFalse(errors.isEmpty());
        assertTrue(errors.stream().anyMatch(e -> e.contains("cliente")));
    }

    @Test
    void splitsIncludedIva() {
        var split = calculator.splitIvaIncluded(new BigDecimal("119000"));
        assertEquals(0, new BigDecimal("100000").compareTo(split.subtotal()));
        assertEquals(0, new BigDecimal("19000").compareTo(split.iva()));
    }
}
