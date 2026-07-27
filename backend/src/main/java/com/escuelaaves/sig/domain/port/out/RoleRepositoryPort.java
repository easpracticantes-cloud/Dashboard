package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.domain.model.RoleName;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RoleEntity;

import java.util.Optional;

public interface RoleRepositoryPort {

    Optional<RoleEntity> findByName(RoleName name);

    RoleEntity save(RoleEntity role);
}
