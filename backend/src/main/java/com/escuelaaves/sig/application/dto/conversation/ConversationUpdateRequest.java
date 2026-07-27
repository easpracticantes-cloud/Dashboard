package com.escuelaaves.sig.application.dto.conversation;

import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.model.ConversationStatus;

import java.util.Set;
import java.util.UUID;

public record ConversationUpdateRequest(
        ConversationStatus status,
        ConversationPriority priority,
        Integer importance,
        UUID assignedUserId,
        String category,
        String notes,
        Set<String> labels
) {
}
