package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.port.out.PasswordResetTokenRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.PasswordResetTokenEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PasswordResetTokenJpaRepository extends JpaRepository<PasswordResetTokenEntity, UUID>, PasswordResetTokenRepositoryPort {

    @Override
    Optional<PasswordResetTokenEntity> findByToken(String token);

    @Override
    PasswordResetTokenEntity save(PasswordResetTokenEntity token);
}
