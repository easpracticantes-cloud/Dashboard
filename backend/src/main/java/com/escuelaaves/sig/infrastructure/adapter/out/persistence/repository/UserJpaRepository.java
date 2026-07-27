package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface UserJpaRepository extends JpaRepository<UserEntity, UUID>, UserRepositoryPort {

    @Override
    Optional<UserEntity> findByUsername(String username);

    @Override
    Optional<UserEntity> findByEmail(String email);

    @Override
    boolean existsByUsername(String username);

    @Override
    boolean existsByEmail(String email);

    @Override
    UserEntity save(UserEntity user);
}
