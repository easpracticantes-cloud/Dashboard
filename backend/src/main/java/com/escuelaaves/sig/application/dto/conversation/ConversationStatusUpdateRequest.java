package com.escuelaaves.sig.application.dto.conversation;

import com.escuelaaves.sig.domain.model.ConversationStatus;
import jakarta.validation.constraints.NotNull;

public record ConversationStatusUpdateRequest(
        @NotNull(message = "El estado es obligatorio") ConversationStatus status
) {
}
