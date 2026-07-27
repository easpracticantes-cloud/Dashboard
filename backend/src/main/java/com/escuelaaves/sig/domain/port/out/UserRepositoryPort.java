package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Puerto de salida para la persistencia de usuarios. Implementado por el
 * repositorio JPA en la capa de infraestructura.
 */
public interface UserRepositoryPort {

    Optional<UserEntity> findByUsername(String username);

    Optional<UserEntity> findByEmail(String email);

    Optional<UserEntity> findById(UUID id);

    boolean existsByUsername(String username);

    boolean existsByEmail(String email);

    List<UserEntity> findAll();

    UserEntity save(UserEntity user);

    void deleteById(UUID id);
}
