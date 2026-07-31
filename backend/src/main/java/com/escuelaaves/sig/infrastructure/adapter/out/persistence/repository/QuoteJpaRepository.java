package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.QuoteEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuoteJpaRepository extends JpaRepository<QuoteEntity, UUID> {
    Optional<QuoteEntity> findByCode(String code);

    long countByValidUntilBetweenAndStatusIn(LocalDate from, LocalDate to, Collection<CommercialStatus> statuses);

    List<QuoteEntity> findByValidUntilBetweenAndStatusIn(
            LocalDate from, LocalDate to, Collection<CommercialStatus> statuses, Pageable pageable);
}
