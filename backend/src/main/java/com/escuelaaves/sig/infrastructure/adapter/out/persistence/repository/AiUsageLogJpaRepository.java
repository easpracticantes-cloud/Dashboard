package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiUsageLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiUsageLogJpaRepository extends JpaRepository<AiUsageLogEntity, Long> {
    List<AiUsageLogEntity> findTop50ByOrderByCreatedAtDesc();
}
