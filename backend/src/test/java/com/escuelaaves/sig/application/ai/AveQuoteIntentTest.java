package com.escuelaaves.sig.application.ai;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AveQuoteIntentTest {

    @Test
    void detectsQuoteAndPdfRequests() {
        assertTrue(AveQuoteIntent.isQuoteRequest("Necesito una cotización de rafting para 4 personas"));
        assertTrue(AveQuoteIntent.isQuoteRequest("Genera el PDF de la cotización"));
        assertTrue(AveQuoteIntent.isQuoteRequest("Descargar excel de la cotización"));
        assertFalse(AveQuoteIntent.isQuoteRequest("¿Quién fue Einstein?"));
    }

    @Test
    void detectsModelRefusalToQuote() {
        assertTrue(AveQuoteIntent.looksLikeQuoteRefusal(
                "Samuel, no puedo generar un PDF de cotización porque no represento a una agencia."));
        assertFalse(AveQuoteIntent.looksLikeQuoteRefusal("Claro, te explico Docker en tres pasos."));
    }
}
