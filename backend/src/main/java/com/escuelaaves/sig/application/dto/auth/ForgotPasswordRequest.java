package com.escuelaaves.sig.application.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record ForgotPasswordRequest(
        @NotBlank @Email(message = "Debe ser un correo valido") String email
) {
}
