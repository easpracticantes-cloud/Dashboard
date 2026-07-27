package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.model.ModuleCode;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.PermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PermissionJpaRepository extends JpaRepository<PermissionEntity, Long> {

    Optional<PermissionEntity> findByModule(ModuleCode module);
}
