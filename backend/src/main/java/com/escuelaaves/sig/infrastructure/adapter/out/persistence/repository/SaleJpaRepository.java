package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SaleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

public interface SaleJpaRepository extends JpaRepository<SaleEntity, UUID> {
    Optional<SaleEntity> findByCode(String code);

    long countBySaleDate(LocalDate saleDate);

    @Query("select coalesce(sum(s.amount), 0) from SaleEntity s where s.saleDate = :saleDate")
    BigDecimal sumAmountBySaleDate(@Param("saleDate") LocalDate saleDate);
}
