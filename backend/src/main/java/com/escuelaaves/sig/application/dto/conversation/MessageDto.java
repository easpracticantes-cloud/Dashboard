package com.escuelaaves.sig.application.dto.conversation;

import com.escuelaaves.sig.domain.model.MessageDirection;
import com.escuelaaves.sig.domain.model.MessageStatus;
import com.escuelaaves.sig.domain.model.SenderType;

import java.time.Instant;
import java.util.UUID;

public record MessageDto(
        UUID id,
        UUID conversationId,
        MessageDirection direction,
        String body,
        MessageStatus status,
        Instant sentAt,
        SenderType senderType,
        UUID agentUserId,
        String agentUserName
) {
}
