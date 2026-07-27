package com.escuelaaves.sig.application.service.support;

import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.shared.exception.UnauthorizedException;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

/**
 * Resuelve el usuario autenticado actual a partir del contexto de seguridad
 * para que los servicios de aplicacion puedan operar sobre "quien" realiza
 * la peticion (perfil, notificaciones, auditoria, etc.).
 */
@Service
@RequiredArgsConstructor
public class CurrentUserService {

    private final UserRepositoryPort userRepositoryPort;

    public UserEntity getCurrentUser() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()) {
            throw new UnauthorizedException("No hay una sesion activa");
        }
        String username = authentication.getName();
        return userRepositoryPort.findByUsername(username)
                .orElseThrow(() -> new UnauthorizedException("El usuario autenticado ya no existe"));
    }
}
