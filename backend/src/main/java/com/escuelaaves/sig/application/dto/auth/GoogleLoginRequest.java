package com.escuelaaves.sig.application.dto.auth;

/**
 * Cuerpo de {@code POST /api/v1/auth/google-login}.
 * Acepta ID Token (GIS) o Access Token (popup con selector de cuentas).
 * Debe enviarse al menos uno de los dos.
 */
public record GoogleLoginRequest(
        String idToken,
        String accessToken
) {
}
