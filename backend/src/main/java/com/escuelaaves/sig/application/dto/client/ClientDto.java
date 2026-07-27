package com.escuelaaves.sig.application.dto.client;

import com.escuelaaves.sig.domain.model.ClientSegment;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

public record ClientDto(
        UUID id,
        String name,
        String phone,
        String email,
        String avatarUrl,
        ClientSegment segment,
        String source,
        String notes,
        UUID assignedUserId,
        String assignedUserName,
        Set<String> tags,
        Instant createdAt,
        Instant lastContactAt
) {
}
