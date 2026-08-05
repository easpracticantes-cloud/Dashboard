package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.BusinessRuleEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface BusinessRuleJpaRepository extends JpaRepository<BusinessRuleEntity, Long> {

    @Query("""
            SELECT r FROM BusinessRuleEntity r
            WHERE r.active = true
              AND (r.tourCode IS NULL OR LOWER(r.tourCode) = LOWER(:tourCode))
            ORDER BY r.priority DESC
            """)
    List<BusinessRuleEntity> findActiveForTour(@Param("tourCode") String tourCode);

    @Query("""
            SELECT r FROM BusinessRuleEntity r
            WHERE r.active = true
            ORDER BY r.priority DESC
            """)
    List<BusinessRuleEntity> findAllActive();
}
