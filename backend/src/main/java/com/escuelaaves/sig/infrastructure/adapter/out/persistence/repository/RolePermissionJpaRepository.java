package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.RolePermissionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface RolePermissionJpaRepository extends JpaRepository<RolePermissionEntity, Long> {

    List<RolePermissionEntity> findByRoleId(Long roleId);
}
