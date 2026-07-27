package com.escuelaaves.sig.application.dto.user;

import com.escuelaaves.sig.domain.model.RoleName;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UserUpdateRequest(
        @Email String email,
        @Size(max = 150) String fullName,
        String avatarUrl,
        RoleName role,
        Boolean active,
        @Size(min = 8, message = "La contrasena debe tener al menos 8 caracteres") String password
) {
}
