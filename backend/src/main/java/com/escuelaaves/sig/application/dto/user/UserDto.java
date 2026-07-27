package com.escuelaaves.sig.application.dto.user;

import com.escuelaaves.sig.domain.model.RoleName;

import java.time.Instant;
import java.util.UUID;

public record UserDto(
        UUID id,
        String username,
        String email,
        String fullName,
        String avatarUrl,
        RoleName role,
        boolean active,
        Instant lastLoginAt,
        Instant createdAt
) {
}
