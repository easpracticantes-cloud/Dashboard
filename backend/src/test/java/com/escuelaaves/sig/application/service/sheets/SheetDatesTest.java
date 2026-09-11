package com.escuelaaves.sig.application.service.sheets;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class SheetDatesTest {

    @Test
    void isoMedianocheUtcNoCambiaElDia() {
        assertEquals(LocalDate.of(2025, 12, 30), SheetDates.parse("2025-12-30T00:00:00.000Z"));
        assertEquals("2025-12-30", SheetDates.calendar("2025-12-30T05:00:00.000Z"));
    }

    @Test
    void diaMesAnioColombiano() {
        assertEquals(LocalDate.of(2025, 12, 30), SheetDates.parse("30/12/2025"));
        assertEquals(LocalDate.of(2025, 12, 30), SheetDates.parse("30-12-25"));
    }

    @Test
    void serialExcel() {
        assertEquals(LocalDate.of(2025, 12, 30), SheetDates.parse("46021"));
    }

    @Test
    void diciembreDelAnioEnCursoAntesDeDiciembreEsElAnioAnterior() {
        LocalDate today = LocalDate.of(2026, 9, 11);
        assertEquals(
                LocalDate.of(2025, 12, 30),
                SheetDates.rewindPrematureDecember(LocalDate.of(2026, 12, 30), today)
        );
        assertEquals(
                LocalDate.of(2026, 6, 15),
                SheetDates.rewindPrematureDecember(LocalDate.of(2026, 6, 15), today)
        );
    }

    @Test
    void enDiciembreNoRebobina() {
        LocalDate today = LocalDate.of(2026, 12, 10);
        assertEquals(
                LocalDate.of(2026, 12, 30),
                SheetDates.rewindPrematureDecember(LocalDate.of(2026, 12, 30), today)
        );
    }

    @Test
    void vacio() {
        assertNull(SheetDates.parse(""));
        assertEquals("", SheetDates.calendar(""));
    }
}
