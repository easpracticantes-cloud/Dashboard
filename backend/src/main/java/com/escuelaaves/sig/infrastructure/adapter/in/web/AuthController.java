package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.auth.ForgotPasswordRequest;
import com.escuelaaves.sig.application.dto.auth.GoogleLoginRequest;
import com.escuelaaves.sig.application.dto.auth.LoginRequest;
import com.escuelaaves.sig.application.dto.auth.LoginResponse;
import com.escuelaaves.sig.application.dto.auth.RefreshTokenRequest;
import com.escuelaaves.sig.application.dto.auth.ResetPasswordRequest;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.domain.port.in.AuthUseCase;
import com.escuelaaves.sig.domain.port.in.GoogleAuthUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Slf4j
@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Autenticacion", description = "Login, recuperacion de contrasena y sesion actual")
public class AuthController {

    private final AuthUseCase authUseCase;
    private final GoogleAuthUseCase googleAuthUseCase;

    @PostMapping("/login")
    @Operation(summary = "Inicia sesion y devuelve un token JWT")
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authUseCase.login(request));
    }

    @PostMapping("/google-login")
    @Operation(summary = "Login con Google (Gmail): valida el ID Token, verifica la lista blanca y emite el JWT propio")
    public ResponseEntity<LoginResponse> googleLogin(@Valid @RequestBody GoogleLoginRequest request) {
        log.info("[GOOGLE-AUTH-AUDIT] AuthController /google-login recibido: hasIdToken={} hasAccessToken={}",
                request.idToken() != null && !request.idToken().isBlank(),
                request.accessToken() != null && !request.accessToken().isBlank());
        return ResponseEntity.ok(googleAuthUseCase.googleLogin(request));
    }

    @PostMapping("/refresh")
    @Operation(summary = "Renueva el access token usando un refresh token")
    public ResponseEntity<LoginResponse> refresh(@Valid @RequestBody RefreshTokenRequest request) {
        return ResponseEntity.ok(authUseCase.refresh(request));
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Solicita un token de recuperacion de contrasena por correo")
    public ResponseEntity<Void> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        authUseCase.forgotPassword(request);
        return ResponseEntity.accepted().build();
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Restablece la contrasena usando un token valido")
    public ResponseEntity<Void> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        authUseCase.resetPassword(request);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    @SecurityRequirement(name = "bearerAuth")
    @Operation(summary = "Devuelve el usuario autenticado actual")
    public ResponseEntity<UserDto> me() {
        return ResponseEntity.ok(authUseCase.me());
    }
}
