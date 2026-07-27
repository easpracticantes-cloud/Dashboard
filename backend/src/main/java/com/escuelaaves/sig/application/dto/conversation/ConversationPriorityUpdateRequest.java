package com.escuelaaves.sig.application.dto.conversation;

import com.escuelaaves.sig.domain.model.ConversationPriority;
import jakarta.validation.constraints.NotNull;

public record ConversationPriorityUpdateRequest(
        @NotNull(message = "La prioridad es obligatoria") ConversationPriority priority
) {
}
