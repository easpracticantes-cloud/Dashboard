package com.escuelaaves.sig.application.dto.integration;

/**
 * Fila tipica proveniente de Google Sheets / feed CRM.
 */
public record SheetConversationRowDto(
        String phone,
        String name,
        String date,
        String time,
        String lastMessage,
        String importance,
        String status,
        String category
) {
}
