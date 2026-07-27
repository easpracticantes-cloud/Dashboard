package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.model.MessageDirection;
import com.escuelaaves.sig.domain.port.out.MessageRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.MessageEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MessageJpaRepository extends JpaRepository<MessageEntity, UUID>, MessageRepositoryPort {

    @Override
    List<MessageEntity> findByConversationIdOrderBySentAtAsc(UUID conversationId);

    @Override
    long countByDirection(MessageDirection direction);

    @Override
    MessageEntity save(MessageEntity message);
}
