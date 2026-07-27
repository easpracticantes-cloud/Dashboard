package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.auth.GoogleLoginRequest;
import com.escuelaaves.sig.application.dto.auth.LoginResponse;

/**
 * Caso de uso de autenticación con Google (Login con Gmail).
 * Valida el ID Token, verifica la lista blanca de correos autorizados y
 * emite el JWT propio del SIG.
 */
public interface GoogleAuthUseCase {

    LoginResponse googleLogin(GoogleLoginRequest request);
}
