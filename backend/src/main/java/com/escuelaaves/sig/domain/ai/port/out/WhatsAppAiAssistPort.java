package com.escuelaaves.sig.domain.ai.port.out;

/**
 * Casos de uso WhatsApp preparados para auto-respuesta (fase enterprise).
 * Implementación actual: stub / draft vía proveedor generativo.
 */
public interface WhatsAppAiAssistPort {

    String draftAutoReply(String conversationText);

    String prioritizeCustomer(String conversationText);

    String summarizeThread(String conversationText);
}
