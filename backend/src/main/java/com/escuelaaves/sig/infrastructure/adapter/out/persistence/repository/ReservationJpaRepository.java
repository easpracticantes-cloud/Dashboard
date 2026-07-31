package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ReservationEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ReservationJpaRepository extends JpaRepository<ReservationEntity, UUID> {
    Optional<ReservationEntity> findByCode(String code);

    long countByReservationDateBetweenAndStatusNot(LocalDate from, LocalDate to, CommercialStatus status);

    List<ReservationEntity> findByReservationDateAndStatusIn(
            LocalDate reservationDate, Collection<CommercialStatus> statuses, Pageable pageable);
}
