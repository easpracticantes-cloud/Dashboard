package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiConversationSessionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiConversationSessionJpaRepository extends JpaRepository<AiConversationSessionEntity, String> {
}
