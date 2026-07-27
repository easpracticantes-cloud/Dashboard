package com.escuelaaves.sig.application.dto.conversation;

import com.escuelaaves.sig.domain.model.ChannelType;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import jakarta.validation.constraints.NotNull;

import java.util.Set;
import java.util.UUID;

public record ConversationCreateRequest(
        @NotNull(message = "El cliente es obligatorio") UUID clientId,
        ConversationPriority priority,
        Integer importance,
        UUID assignedUserId,
        Set<String> labels,
        ChannelType channel,
        String initialMessage
) {
}
