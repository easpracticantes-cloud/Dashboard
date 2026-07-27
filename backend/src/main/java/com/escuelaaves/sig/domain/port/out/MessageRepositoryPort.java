package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.domain.model.MessageDirection;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.MessageEntity;

import java.util.List;
import java.util.UUID;

public interface MessageRepositoryPort {

    List<MessageEntity> findByConversationIdOrderBySentAtAsc(UUID conversationId);

    MessageEntity save(MessageEntity message);

    long count();

    long countByDirection(MessageDirection direction);
}
