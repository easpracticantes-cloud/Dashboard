package com.escuelaaves.sig.domain.model;

import java.util.List;

/**
 * Contexto minimo de una conversacion para que la IA analice y proponga una cotizacion.
 */
public record ChatQuoteContext(
        String clientName,
        String clientPhone,
        List<ChatTurn> turns
) {

    /** Un turno del chat: quien habla y que dijo. */
    public record ChatTurn(boolean fromClient, String text) {
    }
}
