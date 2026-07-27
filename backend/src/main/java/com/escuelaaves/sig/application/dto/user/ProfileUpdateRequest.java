package com.escuelaaves.sig.application.dto.user;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Size;

public record ProfileUpdateRequest(
        @Size(max = 150) String fullName,
        @Email(message = "El correo no es valido")
        @Size(max = 180) String email,
        String avatarUrl,
        @Size(min = 8, message = "La contrasena debe tener al menos 8 caracteres") String password
) {
}
