package com.escuelaaves.sig.domain.port.out.integration;

import com.escuelaaves.sig.domain.model.GoogleUserInfo;

/**
 * Puerto de salida para validar credenciales de Google.
 * Soporta ID Token (GIS credential) y Access Token (popup OAuth con selector de cuentas).
 */
public interface GoogleTokenVerifierPort {

    /**
     * Verifica firma, expiración y audiencia de un Google ID Token.
     */
    GoogleUserInfo verifyIdToken(String idToken);

    /**
     * Valida un Access Token contra la API de userinfo de Google
     * (flujo popup con selector de correo).
     */
    GoogleUserInfo verifyAccessToken(String accessToken);
}
