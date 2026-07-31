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
import jakarta.annotation.PostConstruct;
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

    @Value("${app.google.client-id:}")
    private String googleClientId;

    @Value("${app.jwt.expiration-minutes}")
    private long expirationMinutes;

    @Value("${app.jwt.refresh-expiration-days:30}")
    private long refreshExpirationDays;

    /**
     * Auditoría de arranque: muestra de dónde salen las propiedades Google
     * (variable de entorno / Render vs default de application.yml).
     * No altera comportamiento.
     */
    @PostConstruct
    void auditGoogleAuthConfigOnStartup() {
        log.info("========== [GOOGLE-AUTH-AUDIT] STARTUP CONFIG ==========");
        logGoogleEnvironmentSources("startup");
        log.info("[GOOGLE-AUTH-AUDIT] @Value app.google.client-id (resuelto) = [{}]", googleClientId);
        log.info("[GOOGLE-AUTH-AUDIT] @Value app.google.allowed-emails (resuelto, RAW completo) = [{}]", allowedEmailsRaw);
        log.info("[GOOGLE-AUTH-AUDIT] @Value app.google.default-role (resuelto) = [{}]", defaultRoleName);
        List<String> splitPreview = Arrays.stream(allowedEmailsRaw.split(","))
                .map(s -> "[" + s + "]")
                .toList();
        log.info("[GOOGLE-AUTH-AUDIT] split(\",\") SIN normalizar ({} entradas): {}", splitPreview.size(), splitPreview);
        List<String> normalizedPreview = Arrays.stream(allowedEmailsRaw.split(","))
                .map(this::normalize)
                .filter(s -> !s.isBlank())
                .toList();
        log.info("[GOOGLE-AUTH-AUDIT] split(\",\") normalizado/filtrado ({} entradas): {}",
                normalizedPreview.size(), normalizedPreview);
        log.info("========== [GOOGLE-AUTH-AUDIT] END STARTUP CONFIG ==========");
    }

    @Override
    @Transactional
    public LoginResponse googleLogin(GoogleLoginRequest request) {
        log.info("========== [GOOGLE-AUTH-AUDIT] LOGIN ATTEMPT BEGIN ==========");
        logGoogleEnvironmentSources("login-attempt");
        log.info("[GOOGLE-AUTH-AUDIT] Client ID utilizado (@Value app.google.client-id) = [{}]", googleClientId);
        log.info("[GOOGLE-AUTH-AUDIT] GOOGLE_ALLOWED_EMAILS / app.google.allowed-emails RAW completo = [{}]",
                allowedEmailsRaw);
        log.info("[GOOGLE-AUTH-AUDIT] request.hasIdToken={} request.hasAccessToken={}",
                request.idToken() != null && !request.idToken().isBlank(),
                request.accessToken() != null && !request.accessToken().isBlank());

        GoogleUserInfo info = resolveGoogleIdentity(request);

        log.info("[GOOGLE-AUTH-AUDIT] 1) Email recibido desde Google (raw) = [{}]", info.email());
        log.info("[GOOGLE-AUTH-AUDIT] 2) Nombre recibido desde Google = [{}]", info.name());
        log.info("[GOOGLE-AUTH-AUDIT] Google subject={}, emailVerified={}, picturePresent={}",
                info.subject(),
                info.emailVerified(),
                info.pictureUrl() != null && !info.pictureUrl().isBlank());

        if (!info.emailVerified()) {
            log.warn("[GOOGLE-AUTH-AUDIT] 7) RECHAZO: email_verified=false. Razón exacta: "
                    + "El correo de Google no está verificado");
            log.info("========== [GOOGLE-AUTH-AUDIT] LOGIN ATTEMPT END (REJECTED) ==========");
            throw new UnauthorizedException("El correo de Google no está verificado");
        }

        String email = normalize(info.email());
        log.info("[GOOGLE-AUTH-AUDIT] Email normalizado para comparación = [{}]", email);

        if (email.isBlank()) {
            log.warn("[GOOGLE-AUTH-AUDIT] 7) RECHAZO: Esta cuenta de Google no está autorizada para ingresar al SIG. "
                    + "Razón exacta: Email vacío/blank tras normalizar el valor recibido de Google");
            log.warn("Intento de acceso con Google NO autorizado: {}", email);
            log.info("========== [GOOGLE-AUTH-AUDIT] LOGIN ATTEMPT END (REJECTED) ==========");
            throw new UnauthorizedException("Esta cuenta de Google no está autorizada para ingresar al SIG");
        }

        WhitelistAuditResult whitelist = auditWhitelist(email);
        log.info("[GOOGLE-AUTH-AUDIT] 6) Resultado de la comparación isWhitelisted = {}", whitelist.allowed());
        log.info("[GOOGLE-AUTH-AUDIT] Detalle comparación: {}", whitelist.detail());

        if (!whitelist.allowed()) {
            String reason;
            if (whitelist.entriesEmpty()) {
                reason = "Lista blanca vacía tras split/normalize/filter (app.google.allowed-emails / GOOGLE_ALLOWED_EMAILS sin entradas útiles)";
            } else {
                reason = "Email [" + email + "] no coincide con ninguna entrada de la lista blanca "
                        + whitelist.entries() + " (ni por correo exacto ni por dominio @...)";
            }
            log.warn("[GOOGLE-AUTH-AUDIT] 7) RECHAZO: Esta cuenta de Google no está autorizada para ingresar al SIG. "
                    + "Razón exacta: {}", reason);
            log.warn("Intento de acceso con Google NO autorizado: {}", email);
            log.info("========== [GOOGLE-AUTH-AUDIT] LOGIN ATTEMPT END (REJECTED) ==========");
            throw new UnauthorizedException("Esta cuenta de Google no está autorizada para ingresar al SIG");
        }

        log.info("[GOOGLE-AUTH-AUDIT] Lista blanca OK. Continuando create/update usuario para [{}]", email);
        UserEntity user = userRepositoryPort.findByEmail(email)
                .map(existing -> updateFromGoogle(existing, info))
                .orElseGet(() -> createFromGoogle(info, email));

        log.info("========== [GOOGLE-AUTH-AUDIT] LOGIN ATTEMPT END (SUCCESS userId={}) ==========", user.getId());
        return issueTokens(user);
    }

    private GoogleUserInfo resolveGoogleIdentity(GoogleLoginRequest request) {
        boolean hasId = request.idToken() != null && !request.idToken().isBlank();
        boolean hasAccess = request.accessToken() != null && !request.accessToken().isBlank();
        if (!hasId && !hasAccess) {
            log.warn("[GOOGLE-AUTH-AUDIT] 7) RECHAZO: Se requiere idToken o accessToken de Google");
            throw new UnauthorizedException("Se requiere idToken o accessToken de Google");
        }
        if (hasId) {
            log.info("[GOOGLE-AUTH-AUDIT] Resolviendo identidad vía ID Token");
            return googleTokenVerifierPort.verifyIdToken(request.idToken());
        }
        log.info("[GOOGLE-AUTH-AUDIT] Resolviendo identidad vía Access Token (userinfo)");
        return googleTokenVerifierPort.verifyAccessToken(request.accessToken());
    }

    /**
     * Misma lógica de lista blanca; delega en {@link #auditWhitelist} (solo añade trazas).
     */
    @SuppressWarnings("unused")
    private boolean isWhitelisted(String email) {
        return auditWhitelist(email).allowed();
    }

    private WhitelistAuditResult auditWhitelist(String email) {
        String[] rawParts = allowedEmailsRaw.split(",");
        log.info("[GOOGLE-AUTH-AUDIT] 5) Lista obtenida después de split(\",\") — {} parte(s) crudas: {}",
                rawParts.length,
                Arrays.stream(rawParts).map(p -> "[" + p + "] len=" + p.length()).toList());

        List<String> entries = Arrays.stream(rawParts)
                .map(this::normalize)
                .filter(s -> !s.isBlank())
                .toList();

        log.info("[GOOGLE-AUTH-AUDIT] 5b) Lista tras normalize+filterBlank — {} entrada(s): {}",
                entries.size(), entries);

        if (entries.isEmpty()) {
            log.error("app.google.allowed-emails está vacío: se rechazan todos los accesos por Google");
            log.error("[GOOGLE-AUTH-AUDIT] allowedEmailsRaw length={}, isBlank={}, codepoints={}",
                    allowedEmailsRaw == null ? -1 : allowedEmailsRaw.length(),
                    allowedEmailsRaw == null || allowedEmailsRaw.isBlank(),
                    allowedEmailsRaw == null ? "null" : allowedEmailsRaw.chars().limit(80).boxed().toList());
            return new WhitelistAuditResult(false, true, entries, "entries vacías → deny-all");
        }

        String domain = email.contains("@") ? email.substring(email.indexOf('@')) : "";
        log.info("[GOOGLE-AUTH-AUDIT] Dominio extraído del email = [{}]", domain);

        StringBuilder detail = new StringBuilder();
        for (int i = 0; i < entries.size(); i++) {
            String entry = entries.get(i);
            boolean domainRule = entry.startsWith("@") || entry.startsWith("*@");
            if (domainRule) {
                String allowedDomain = entry.substring(entry.indexOf('@'));
                boolean match = domain.equalsIgnoreCase(allowedDomain);
                detail.append(String.format(
                        "rule[%d]=DOMAIN entry=[%s] allowedDomain=[%s] emailDomain=[%s] equalsIgnoreCase=%s; ",
                        i, entry, allowedDomain, domain, match));
                log.info("[GOOGLE-AUTH-AUDIT] Comparación rule[{}] DOMAIN entry=[{}] allowedDomain=[{}] "
                                + "emailDomain=[{}] match={}",
                        i, entry, allowedDomain, domain, match);
                if (match) {
                    return new WhitelistAuditResult(true, false, entries, detail + "→ ALLOW");
                }
            } else {
                boolean match = entry.equalsIgnoreCase(email);
                detail.append(String.format(
                        "rule[%d]=EMAIL entry=[%s] email=[%s] equalsIgnoreCase=%s; ",
                        i, entry, email, match));
                log.info("[GOOGLE-AUTH-AUDIT] Comparación rule[{}] EMAIL entry=[{}] email=[{}] match={}",
                        i, entry, email, match);
                if (match) {
                    return new WhitelistAuditResult(true, false, entries, detail + "→ ALLOW");
                }
            }
        }
        return new WhitelistAuditResult(false, false, entries, detail + "→ DENY (sin coincidencias)");
    }

    private void logGoogleEnvironmentSources(String phase) {
        String envClientId = System.getenv("GOOGLE_CLIENT_ID");
        String envAllowed = System.getenv("GOOGLE_ALLOWED_EMAILS");
        String envDefaultRole = System.getenv("GOOGLE_DEFAULT_ROLE");
        String envSheetsUrl = System.getenv("GOOGLE_SHEETS_WEBAPP_URL");

        log.info("[GOOGLE-AUTH-AUDIT] [{}] 8) Variables de entorno relacionadas con Google (System.getenv):", phase);
        log.info("[GOOGLE-AUTH-AUDIT]   GOOGLE_CLIENT_ID getenv = [{}] present={}",
                envClientId, envClientId != null);
        log.info("[GOOGLE-AUTH-AUDIT]   GOOGLE_ALLOWED_EMAILS getenv = [{}] present={}",
                envAllowed, envAllowed != null);
        log.info("[GOOGLE-AUTH-AUDIT]   GOOGLE_DEFAULT_ROLE getenv = [{}] present={}",
                envDefaultRole, envDefaultRole != null);
        log.info("[GOOGLE-AUTH-AUDIT]   GOOGLE_SHEETS_WEBAPP_URL getenv present={} (valor omitido si largo)",
                envSheetsUrl != null);

        log.info("[GOOGLE-AUTH-AUDIT] [{}] 9) Origen inferido de cada propiedad:", phase);
        log.info("[GOOGLE-AUTH-AUDIT]   client-id ← {}", describeSource(envClientId, googleClientId, "GOOGLE_CLIENT_ID", "app.google.client-id / application.yml default vacío"));
        log.info("[GOOGLE-AUTH-AUDIT]   allowed-emails ← {}", describeSource(envAllowed, allowedEmailsRaw, "GOOGLE_ALLOWED_EMAILS", "app.google.allowed-emails / application.yml default vacío"));
        log.info("[GOOGLE-AUTH-AUDIT]   default-role ← {}", describeSource(envDefaultRole, defaultRoleName, "GOOGLE_DEFAULT_ROLE", "app.google.default-role / application.yml default GERENCIA"));
    }

    /**
     * Si System.getenv(key) no es null, Spring está leyendo la variable de entorno
     * (p. ej. Render). Si es null, el valor resuelto viene del default de application.yml
     * (u otra property source que no sea esa env var).
     */
    private static String describeSource(String getenvValue, String resolvedValue, String envKey, String ymlFallback) {
        if (getenvValue != null) {
            boolean same = getenvValue.equals(resolvedValue);
            return "VARIABLE DE ENTORNO / Render (" + envKey + "), getenvPresent=true, "
                    + "resolvedEqualsGetenv=" + same
                    + ", resolvedLength=" + (resolvedValue == null ? -1 : resolvedValue.length())
                    + ", getenvLength=" + getenvValue.length();
        }
        return "NO hay " + envKey + " en System.getenv → valor desde " + ymlFallback
                + " (resolved=[" + resolvedValue + "])";
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

    private record WhitelistAuditResult(
            boolean allowed,
            boolean entriesEmpty,
            List<String> entries,
            String detail
    ) {
    }
}
