package com.escuelaaves.sig.domain.ai.model;

/**
 * Respuesta genérica de chat con el modelo generativo.
 */
public record AiChatResult(
        String reply,
        String model,
        boolean success,
        String message
) {
}
