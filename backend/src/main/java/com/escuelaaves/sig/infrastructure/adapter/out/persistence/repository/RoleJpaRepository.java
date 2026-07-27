package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.model.RoleName;
import com.escuelaaves.sig.domain.port.out.RoleRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RoleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RoleJpaRepository extends JpaRepository<RoleEntity, Long>, RoleRepositoryPort {

    @Override
    Optional<RoleEntity> findByName(RoleName name);

    @Override
    RoleEntity save(RoleEntity role);
}
