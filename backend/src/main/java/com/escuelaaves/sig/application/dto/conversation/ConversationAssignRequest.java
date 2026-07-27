package com.escuelaaves.sig.application.dto.conversation;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record ConversationAssignRequest(
        @NotNull(message = "El usuario asignado es obligatorio") UUID assignedUserId
) {
}
