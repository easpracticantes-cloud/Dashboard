package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.TourProductEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TourProductJpaRepository extends JpaRepository<TourProductEntity, Long> {

    Optional<TourProductEntity> findByCodeIgnoreCase(String code);

    List<TourProductEntity> findByActiveTrueOrderByNameAsc();
}
