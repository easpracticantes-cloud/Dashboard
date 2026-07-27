package com.escuelaaves.sig.application.dto.user;

import com.escuelaaves.sig.domain.model.RoleName;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UserCreateRequest(
        @NotBlank @Size(min = 3, max = 60) String username,
        @NotBlank @Email String email,
        @NotBlank @Size(min = 8, message = "La contrasena debe tener al menos 8 caracteres") String password,
        @NotBlank @Size(max = 150) String fullName,
        String avatarUrl,
        @NotNull RoleName role,
        Boolean active
) {
}
