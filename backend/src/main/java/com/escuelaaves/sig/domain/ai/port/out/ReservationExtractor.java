package com.escuelaaves.sig.domain.ai.port.out;

import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;

public interface ReservationExtractor {
    ReservationExtraction extractReservationInformation(String message);
}
