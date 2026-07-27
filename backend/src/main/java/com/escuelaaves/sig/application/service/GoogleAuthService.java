package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.auth.GoogleLoginRequest;
import com.escuelaaves.sig.application.dto.auth.LoginResponse;
import com.escuelaaves.sig.application.mapper.UserMapper;
import com.escuelaaves.sig.domain.model.GoogleUserInfo;
import com.escuelaaves.sig.domain.model.RoleName;
import com.escuelaaves.sig.domain.port.in.GoogleAuthUseCase;
import com.escuelaaves.sig.domain.port.out.RoleRepositoryPort;
import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.GoogleTokenVerifierPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RefreshTokenEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RoleEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.RefreshTokenJpaRepository;
import com.escuelaaves.sig.infrastructure.security.JwtService;
import com.escuelaaves.sig.shared.exception.UnauthorizedException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * Autenticación con Google (Login con Gmail).
 *
 * Flujo: el frontend obtiene un ID Token con Google Identity Services y lo
 * envía a {@code /api/v1/auth/google-login}. Aquí se valida el token, se
 * comprueba que el correo esté en la lista blanca (correo de la jefa +
 * autorizados), se crea/actualiza el usuario en BD y se emite el JWT propio
 * del SIG (mismo formato que el login por usuario/contraseña).
 */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class GoogleAuthService implements GoogleAuthUseCase {

    private final GoogleTokenVerifierPort googleTokenVerifierPort;
    private final UserRepositoryPort userRepositoryPort;
    private final RoleRepositoryPort roleRepositoryPort;
    private final RefreshTokenJpaRepository refreshTokenJpaRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final UserMapper userMapper;

    /** Correos y/o dominios autorizados, separados por coma. Ej: jefa@gmail.com,@escuelaavessalento.com */
    @Value("${app.google.allowed-emails:}")
    private String allowedEmailsRaw;

    /** Rol asignado a un usuario nuevo que entra por Google la primera vez. */
    @Value("${app.google.default-role:GERENCIA}")
    private String defaultRoleName;

    @Value("${app.jwt.expiration-minutes}")
    private long expirationMinutes;

    @Value("${app.jwt.refresh-expiration-days:30}")
    private long refreshExpirationDays;

    @Override
    @Transactional
    public LoginResponse googleLogin(GoogleLoginRequest request) {
        GoogleUserInfo info = resolveGoogleIdentity(request);

        if (!info.emailVerified()) {
            throw new UnauthorizedException("El correo de Google no está verificado");
        }

        String email = normalize(info.email());
        if (email.isBlank() || !isWhitelisted(email)) {
            log.warn("Intento de acceso con Google NO autorizado: {}", email);
            throw new UnauthorizedException("Esta cuenta de Google no está autorizada para ingresar al SIG");
        }

        UserEntity user = userRepositoryPort.findByEmail(email)
                .map(existing -> updateFromGoogle(existing, info))
                .orElseGet(() -> createFromGoogle(info, email));

        return issueTokens(user);
    }

    private GoogleUserInfo resolveGoogleIdentity(GoogleLoginRequest request) {
        boolean hasId = request.idToken() != null && !request.idToken().isBlank();
        boolean hasAccess = request.accessToken() != null && !request.accessToken().isBlank();
        if (!hasId && !hasAccess) {
            throw new UnauthorizedException("Se requiere idToken o accessToken de Google");
        }
        if (hasId) {
            return googleTokenVerifierPort.verifyIdToken(request.idToken());
        }
        return googleTokenVerifierPort.verifyAccessToken(request.accessToken());
    }

    private boolean isWhitelisted(String email) {
        List<String> entries = Arrays.stream(allowedEmailsRaw.split(","))
                .map(this::normalize)
                .filter(s -> !s.isBlank())
                .toList();

        if (entries.isEmpty()) {
            log.error("app.google.allowed-emails está vacío: se rechazan todos los accesos por Google");
            return false;
        }

        String domain = email.contains("@") ? email.substring(email.indexOf('@')) : "";
        for (String entry : entries) {
            boolean domainRule = entry.startsWith("@") || entry.startsWith("*@");
            if (domainRule) {
                String allowedDomain = entry.substring(entry.indexOf('@'));
                if (domain.equalsIgnoreCase(allowedDomain)) {
                    return true;
                }
            } else if (entry.equalsIgnoreCase(email)) {
                return true;
            }
        }
        return false;
    }

    private UserEntity createFromGoogle(GoogleUserInfo info, String email) {
        RoleEntity role = resolveDefaultRole();
        String fullName = info.name() != null && !info.name().isBlank() ? info.name().trim() : email;

        UserEntity user = UserEntity.builder()
                .username(uniqueUsername(email))
                .email(email)
                // Los usuarios de Google no usan contraseña local; se guarda un hash
                // aleatorio irrecuperable para satisfacer la restricción NOT NULL.
                .passwordHash(passwordEncoder.encode(UUID.randomUUID().toString()))
                .fullName(fullName)
                .avatarUrl(info.pictureUrl())
                .role(role)
                .active(true)
                .lastLoginAt(Instant.now())
                .build();

        UserEntity saved = userRepositoryPort.save(user);
        log.info("Usuario creado vía Google: {} ({}) con rol {}", saved.getUsername(), email, role.getName());
        return saved;
    }

    private UserEntity updateFromGoogle(UserEntity user, GoogleUserInfo info) {
        if (!user.isActive()) {
            throw new UnauthorizedException("El usuario está inactivo. Contacta al administrador.");
        }
        if (info.pictureUrl() != null && !info.pictureUrl().isBlank()) {
            user.setAvatarUrl(info.pictureUrl());
        }
        if (info.name() != null && !info.name().isBlank()) {
            user.setFullName(info.name().trim());
        }
        user.setLastLoginAt(Instant.now());
        return userRepositoryPort.save(user);
    }

    private RoleEntity resolveDefaultRole() {
        RoleName roleName;
        try {
            roleName = RoleName.valueOf(defaultRoleName.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            roleName = RoleName.GERENCIA;
        }
        return roleRepositoryPort.findByName(roleName)
                .orElseThrow(() -> new UnauthorizedException(
                        "No existe el rol por defecto configurado para Google: " + defaultRoleName));
    }

    private String uniqueUsername(String email) {
        String base = email.substring(0, email.indexOf('@') > 0 ? email.indexOf('@') : email.length())
                .replaceAll("[^a-zA-Z0-9._-]", "")
                .toLowerCase(Locale.ROOT);
        if (base.isBlank()) {
            base = "google";
        }
        String candidate = base;
        int counter = 1;
        while (userRepositoryPort.existsByUsername(candidate)) {
            candidate = base + counter++;
        }
        return candidate;
    }

    private LoginResponse issueTokens(UserEntity user) {
        String token = jwtService.generateToken(
                user.getId(), user.getUsername(), user.getRole().getName().name(), false);

        String refresh = UUID.randomUUID().toString().replace("-", "")
                + UUID.randomUUID().toString().replace("-", "");
        refreshTokenJpaRepository.save(RefreshTokenEntity.builder()
                .token(refresh)
                .user(user)
                .expiresAt(Instant.now().plusSeconds(refreshExpirationDays * 24 * 60 * 60))
                .revoked(false)
                .build());

        return new LoginResponse(token, refresh, "Bearer", expirationMinutes, userMapper.toDto(user));
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }
}
