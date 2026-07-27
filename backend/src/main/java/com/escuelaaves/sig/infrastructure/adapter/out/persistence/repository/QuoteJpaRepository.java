package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.QuoteEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface QuoteJpaRepository extends JpaRepository<QuoteEntity, UUID> {
    Optional<QuoteEntity> findByCode(String code);
}
