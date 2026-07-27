package com.escuelaaves.sig.application.dto.conversation;

import jakarta.validation.constraints.NotBlank;

public record MessageCreateRequest(
        @NotBlank(message = "El mensaje no puede estar vacio") String body
) {
}
