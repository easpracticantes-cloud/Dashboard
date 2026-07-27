package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.auth.ForgotPasswordRequest;
import com.escuelaaves.sig.application.dto.auth.LoginRequest;
import com.escuelaaves.sig.application.dto.auth.LoginResponse;
import com.escuelaaves.sig.application.dto.auth.RefreshTokenRequest;
import com.escuelaaves.sig.application.dto.auth.ResetPasswordRequest;
import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.application.mapper.UserMapper;
import com.escuelaaves.sig.application.service.support.CurrentUserService;
import com.escuelaaves.sig.domain.port.in.AuthUseCase;
import com.escuelaaves.sig.domain.port.out.PasswordResetTokenRepositoryPort;
import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.EmailPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.PasswordResetTokenEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RefreshTokenEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.RefreshTokenJpaRepository;
import com.escuelaaves.sig.infrastructure.security.JwtService;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AuthService implements AuthUseCase {

    private final AuthenticationManager authenticationManager;
    private final UserRepositoryPort userRepositoryPort;
    private final PasswordResetTokenRepositoryPort passwordResetTokenRepositoryPort;
    private final RefreshTokenJpaRepository refreshTokenJpaRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final UserMapper userMapper;
    private final EmailPort emailPort;
    private final CurrentUserService currentUserService;

    @Value("${app.jwt.expiration-minutes}")
    private long expirationMinutes;

    @Value("${app.jwt.remember-me-expiration-minutes:10080}")
    private long rememberMeExpirationMinutes;

    @Value("${app.jwt.refresh-expiration-days:30}")
    private long refreshExpirationDays;

    @Override
    @Transactional
    public LoginResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password()));

        UserEntity user = userRepositoryPort.findByUsername(request.username())
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado"));

        user.setLastLoginAt(Instant.now());
        userRepositoryPort.save(user);

        return issueTokens(user, request.rememberMe());
    }

    @Override
    @Transactional
    public LoginResponse refresh(RefreshTokenRequest request) {
        if (request == null || request.refreshToken() == null || request.refreshToken().isBlank()) {
            throw new BadRequestException("Refresh token requerido");
        }
        RefreshTokenEntity stored = refreshTokenJpaRepository.findByToken(request.refreshToken())
                .orElseThrow(() -> new BadRequestException("Refresh token invalido"));
        if (!stored.isValid()) {
            throw new BadRequestException("Refresh token expirado o revocado");
        }
        stored.setRevoked(true);
        refreshTokenJpaRepository.save(stored);
        return issueTokens(stored.getUser(), false);
    }

    private LoginResponse issueTokens(UserEntity user, boolean rememberMe) {
        String token = jwtService.generateToken(user.getId(), user.getUsername(), user.getRole().getName().name(), rememberMe);
        long minutes = rememberMe ? rememberMeExpirationMinutes : expirationMinutes;

        String refresh = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        refreshTokenJpaRepository.save(RefreshTokenEntity.builder()
                .token(refresh)
                .user(user)
                .expiresAt(Instant.now().plusSeconds(refreshExpirationDays * 24 * 60 * 60))
                .revoked(false)
                .build());

        return new LoginResponse(token, refresh, "Bearer", minutes, userMapper.toDto(user));
    }

    @Override
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        userRepositoryPort.findByEmail(request.email()).ifPresentOrElse(user -> {
            String token = UUID.randomUUID().toString().replace("-", "");
            PasswordResetTokenEntity resetToken = PasswordResetTokenEntity.builder()
                    .token(token)
                    .user(user)
                    .expiresAt(Instant.now().plusSeconds(30 * 60))
                    .used(false)
                    .build();
            passwordResetTokenRepositoryPort.save(resetToken);
            emailPort.sendEmail(user.getEmail(), "Recuperacion de contrasena - SIG",
                    "Usa este token para restablecer tu contrasena: " + token);
            log.info("Token de recuperacion generado para {}", user.getUsername());
        }, () -> log.info("Solicitud de recuperacion para correo no registrado: {}", request.email()));
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        PasswordResetTokenEntity resetToken = passwordResetTokenRepositoryPort.findByToken(request.token())
                .orElseThrow(() -> new BadRequestException("Token invalido o expirado"));

        if (resetToken.isUsed() || resetToken.getExpiresAt().isBefore(Instant.now())) {
            throw new BadRequestException("Token invalido o expirado");
        }

        UserEntity user = resetToken.getUser();
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        userRepositoryPort.save(user);

        resetToken.setUsed(true);
        passwordResetTokenRepositoryPort.save(resetToken);
    }

    @Override
    public UserDto me() {
        return userMapper.toDto(currentUserService.getCurrentUser());
    }
}
