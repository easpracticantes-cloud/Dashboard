package com.escuelaaves.sig.domain.ai.model;

/**
 * Datos de reserva extraídos de texto libre (sin precios).
 */
public record ReservationExtraction(
        String tour,
        Integer people,
        String date,
        String pickup,
        String notes
) {
}
