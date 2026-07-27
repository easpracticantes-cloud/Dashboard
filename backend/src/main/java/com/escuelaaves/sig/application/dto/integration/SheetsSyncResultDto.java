package com.escuelaaves.sig.application.dto.integration;

public record SheetsSyncResultDto(
        boolean success,
        String message,
        int rowsRead,
        int clientsUpserted,
        int conversationsUpserted,
        String syncedAt
) {
}
