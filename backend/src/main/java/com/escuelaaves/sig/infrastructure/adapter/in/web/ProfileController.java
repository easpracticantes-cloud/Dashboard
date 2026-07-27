package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.user.ProfileUpdateRequest;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.domain.port.in.UserUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/profile")
@RequiredArgsConstructor
@Tag(name = "Perfil", description = "Perfil del usuario autenticado")
public class ProfileController {

    private final UserUseCase userUseCase;

    @GetMapping
    @Operation(summary = "Obtiene el perfil del usuario autenticado")
    public ResponseEntity<UserDto> getProfile() {
        return ResponseEntity.ok(userUseCase.getProfile());
    }

    @PutMapping
    @Operation(summary = "Actualiza el perfil del usuario autenticado")
    public ResponseEntity<UserDto> updateProfile(@Valid @RequestBody ProfileUpdateRequest request) {
        return ResponseEntity.ok(userUseCase.updateProfile(request));
    }
}
