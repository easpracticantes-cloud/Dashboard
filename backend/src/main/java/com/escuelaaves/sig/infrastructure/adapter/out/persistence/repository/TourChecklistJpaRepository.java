package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.TourChecklistEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TourChecklistJpaRepository extends JpaRepository<TourChecklistEntity, Long> {

    Optional<TourChecklistEntity> findFirstByTourCodeIgnoreCaseAndActiveTrue(String tourCode);

    Optional<TourChecklistEntity> findByCodeIgnoreCaseAndActiveTrue(String code);
}
