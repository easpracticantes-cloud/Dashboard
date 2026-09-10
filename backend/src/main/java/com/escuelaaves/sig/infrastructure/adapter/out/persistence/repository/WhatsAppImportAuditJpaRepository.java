package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.WhatsAppImportAuditEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface WhatsAppImportAuditJpaRepository extends JpaRepository<WhatsAppImportAuditEntity, UUID> {
}
