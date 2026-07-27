package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ConversationRepositoryPort {

    Optional<ConversationEntity> findById(UUID id);

    Optional<ConversationEntity> findByExternalKey(String externalKey);

    Optional<ConversationEntity> findFirstByExternalKey(String externalKey);

    Page<ConversationEntity> findAll(Pageable pageable);

    List<ConversationEntity> findAll();

    List<ConversationEntity> findTop5ByOrderByLastMessageAtDesc();

    ConversationEntity save(ConversationEntity conversation);

    void deleteById(UUID id);

    long count();

    long countByStatus(com.escuelaaves.sig.domain.model.ConversationStatus status);
}
