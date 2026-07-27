package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.port.out.AuditLogRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AuditLogJpaRepository extends JpaRepository<AuditLogEntity, UUID>, AuditLogRepositoryPort {

    @Override
    AuditLogEntity save(AuditLogEntity auditLog);

    @Override
    List<AuditLogEntity> findTop50ByOrderByCreatedAtDesc();
}
