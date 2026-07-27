package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.model.ConversationStatus;
import com.escuelaaves.sig.domain.port.out.ConversationRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConversationJpaRepository extends JpaRepository<ConversationEntity, java.util.UUID>, ConversationRepositoryPort {

    @Override
    List<ConversationEntity> findTop5ByOrderByLastMessageAtDesc();

    @Override
    long countByStatus(ConversationStatus status);

    @Override
    ConversationEntity save(ConversationEntity conversation);

    @Override
    java.util.Optional<ConversationEntity> findByExternalKey(String externalKey);

    @Override
    java.util.Optional<ConversationEntity> findFirstByExternalKey(String externalKey);
}
