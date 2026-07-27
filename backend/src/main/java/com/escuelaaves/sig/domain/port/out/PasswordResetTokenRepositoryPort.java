package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.PasswordResetTokenEntity;

import java.util.Optional;

public interface PasswordResetTokenRepositoryPort {

    Optional<PasswordResetTokenEntity> findByToken(String token);

    PasswordResetTokenEntity save(PasswordResetTokenEntity token);
}
