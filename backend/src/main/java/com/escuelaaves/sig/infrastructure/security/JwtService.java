package com.escuelaaves.sig.infrastructure.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

/**
 * Genera y valida los JSON Web Tokens usados para autenticar las peticiones
 * a la API de SIG.
 */
@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long defaultExpirationMinutes;
    private final long rememberMeExpirationMinutes;

    public JwtService(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expiration-minutes}") long defaultExpirationMinutes,
            @Value("${app.jwt.remember-me-expiration-minutes:10080}") long rememberMeExpirationMinutes) {
        byte[] keyBytes = secret.getBytes(StandardCharsets.UTF_8);
        if (keyBytes.length < 32) {
            byte[] padded = new byte[32];
            System.arraycopy(keyBytes, 0, padded, 0, Math.min(keyBytes.length, 32));
            keyBytes = padded;
        }
        this.signingKey = Keys.hmacShaKeyFor(keyBytes);
        this.defaultExpirationMinutes = defaultExpirationMinutes;
        this.rememberMeExpirationMinutes = rememberMeExpirationMinutes;
    }

    public String generateToken(UUID userId, String username, String role, boolean rememberMe) {
        long minutes = rememberMe ? rememberMeExpirationMinutes : defaultExpirationMinutes;
        Instant now = Instant.now();
        Instant expiry = now.plusSeconds(minutes * 60);
        return Jwts.builder()
                .subject(username)
                .claims(Map.of(
                        "userId", userId.toString(),
                        "role", role))
                .issuedAt(Date.from(now))
                .expiration(Date.from(expiry))
                .signWith(signingKey)
                .compact();
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public UUID extractUserId(String token) {
        String userId = extractClaim(token, claims -> claims.get("userId", String.class));
        return UUID.fromString(userId);
    }

    public String extractRole(String token) {
        return extractClaim(token, claims -> claims.get("role", String.class));
    }

    public boolean isTokenValid(String token, String usernameToMatch) {
        try {
            String username = extractUsername(token);
            return username.equals(usernameToMatch) && !isTokenExpired(token);
        } catch (Exception ex) {
            return false;
        }
    }

    private boolean isTokenExpired(String token) {
        return extractClaim(token, Claims::getExpiration).before(new Date());
    }

    private <T> T extractClaim(String token, Function<Claims, T> resolver) {
        Claims claims = Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        return resolver.apply(claims);
    }
}
