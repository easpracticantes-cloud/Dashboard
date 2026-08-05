package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiUsageLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiUsageLogJpaRepository extends JpaRepository<AiUsageLogEntity, Long> {
}
