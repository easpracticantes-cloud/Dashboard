package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SaleEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SaleJpaRepository extends JpaRepository<SaleEntity, UUID> {
    Optional<SaleEntity> findByCode(String code);
}
