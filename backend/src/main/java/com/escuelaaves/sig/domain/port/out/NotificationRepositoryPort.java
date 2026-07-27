package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.NotificationEntity;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface NotificationRepositoryPort {

    List<NotificationEntity> findByUserIdOrderByCreatedAtDesc(UUID userId);

    long countByUserIdAndReadFalse(UUID userId);

    Optional<NotificationEntity> findById(UUID id);

    NotificationEntity save(NotificationEntity notification);
}
