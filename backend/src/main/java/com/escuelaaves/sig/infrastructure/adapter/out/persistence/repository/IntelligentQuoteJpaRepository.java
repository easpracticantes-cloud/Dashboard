package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.IntelligentQuoteEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface IntelligentQuoteJpaRepository extends JpaRepository<IntelligentQuoteEntity, UUID> {
}
