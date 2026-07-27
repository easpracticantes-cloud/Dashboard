package com.escuelaaves.sig.domain.model;

/**
 * Datos de identidad ya verificados a partir de un Google ID Token.
 * Es el resultado del puerto de verificación y viaja hacia la capa de
 * aplicación sin exponer detalles de la librería de Google.
 */
public record GoogleUserInfo(
        String subject,
        String email,
        boolean emailVerified,
        String name,
        String pictureUrl
) {
}
