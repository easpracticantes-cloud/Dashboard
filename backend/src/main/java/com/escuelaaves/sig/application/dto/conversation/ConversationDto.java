package com.escuelaaves.sig.application.dto.conversation;

import com.escuelaaves.sig.domain.model.ChannelType;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.model.ConversationStatus;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record ConversationDto(
        UUID id,
        UUID clientId,
        String clientName,
        String clientAvatarUrl,
        String clientPhone,
        ConversationStatus status,
        ConversationPriority priority,
        int importance,
        UUID assignedUserId,
        String assignedUserName,
        int unreadCount,
        String lastMessagePreview,
        Instant lastMessageAt,
        Set<String> labels,
        String category,
        String notes,
        ChannelType channel,
        Instant createdAt
) {
}
