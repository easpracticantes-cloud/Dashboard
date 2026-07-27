package com.escuelaaves.sig.application.dto.client;

import com.escuelaaves.sig.domain.model.ClientSegment;
import jakarta.validation.constraints.NotBlank;

import java.util.Set;
import java.util.UUID;

public record ClientCreateRequest(
        @NotBlank(message = "El nombre es obligatorio") String name,
        String phone,
        String email,
        String avatarUrl,
        ClientSegment segment,
        String source,
        String notes,
        UUID assignedUserId,
        Set<String> tags
) {
}
