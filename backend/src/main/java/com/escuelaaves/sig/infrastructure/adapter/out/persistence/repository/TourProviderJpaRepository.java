package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.TourProviderEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TourProviderJpaRepository extends JpaRepository<TourProviderEntity, Long> {

    @Query("""
            SELECT p FROM TourProviderEntity p
            WHERE p.active = true
              AND (:category IS NULL OR LOWER(p.category) = LOWER(:category))
              AND (p.tourCode IS NULL OR :tourCode IS NULL OR LOWER(p.tourCode) = LOWER(:tourCode))
            ORDER BY p.priority DESC
            """)
    List<TourProviderEntity> findRecommendations(
            @Param("tourCode") String tourCode,
            @Param("category") String category
    );
}
