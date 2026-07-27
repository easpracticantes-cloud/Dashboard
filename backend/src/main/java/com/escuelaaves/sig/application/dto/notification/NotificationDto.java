package com.escuelaaves.sig.application.dto.notification;

import com.escuelaaves.sig.domain.model.NotificationType;

import java.time.Instant;
import java.util.UUID;

public record NotificationDto(
        UUID id,
        UUID userId,
        String title,
        String body,
        NotificationType type,
        boolean read,
        String link,
        Instant createdAt
) {
}
