package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiUsageLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface AiUsageLogJpaRepository extends JpaRepository<AiUsageLogEntity, Long> {
    List<AiUsageLogEntity> findTop50ByOrderByCreatedAtDesc();

    @Query("""
            select coalesce(sum(e.estimatedCostUsd), 0)
            from AiUsageLogEntity e
            where lower(e.provider) in ('claude', 'anthropic')
            """)
    BigDecimal sumClaudeEstimatedCostUsd();

    @Query("""
            select count(e)
            from AiUsageLogEntity e
            where lower(e.provider) in ('claude', 'anthropic')
            """)
    long countClaudeCalls();

    @Query("""
            select max(e.createdAt)
            from AiUsageLogEntity e
            where lower(e.provider) in ('claude', 'anthropic')
            """)
    Optional<Instant> lastClaudeUsageAt();
}
