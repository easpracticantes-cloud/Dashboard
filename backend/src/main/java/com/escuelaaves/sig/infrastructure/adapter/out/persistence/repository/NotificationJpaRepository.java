package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.port.out.NotificationRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.NotificationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface NotificationJpaRepository extends JpaRepository<NotificationEntity, UUID>, NotificationRepositoryPort {

    @Override
    List<NotificationEntity> findByUserIdOrderByCreatedAtDesc(UUID userId);

    @Override
    long countByUserIdAndReadFalse(UUID userId);

    @Override
    NotificationEntity save(NotificationEntity notification);
}
