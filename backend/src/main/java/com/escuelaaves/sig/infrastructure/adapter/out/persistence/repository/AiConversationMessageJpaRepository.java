package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiConversationMessageEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AiConversationMessageJpaRepository extends JpaRepository<AiConversationMessageEntity, Long> {

    List<AiConversationMessageEntity> findBySession_IdOrderByCreatedAtDesc(String sessionId, Pageable pageable);
}
