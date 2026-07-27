package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AuditLogEntity;

import java.util.List;

public interface AuditLogRepositoryPort {

    AuditLogEntity save(AuditLogEntity auditLog);

    List<AuditLogEntity> findTop50ByOrderByCreatedAtDesc();
}
