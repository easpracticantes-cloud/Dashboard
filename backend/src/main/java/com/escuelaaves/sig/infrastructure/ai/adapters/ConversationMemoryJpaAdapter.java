package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.port.out.ConversationMemoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiConversationMessageEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiConversationSessionEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.AiConversationMessageJpaRepository;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.AiConversationSessionJpaRepository;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class ConversationMemoryJpaAdapter implements ConversationMemoryPort {

    private final AiConversationSessionJpaRepository sessionRepository;
    private final AiConversationMessageJpaRepository messageRepository;

    @Override
    @Transactional
    public String startSession(Long userId, String title) {
        String id = UUID.randomUUID().toString().replace("-", "");
        AiConversationSessionEntity session = AiConversationSessionEntity.builder()
                .id(id)
                .userId(userId)
                .title(title != null ? title : "Sesión IA")
                .createdAt(Instant.now())
                .updatedAt(Instant.now())
                .build();
        sessionRepository.save(session);
        return id;
    }

    @Override
    @Transactional
    public void appendMessage(String sessionId, String role, String content) {
        AiConversationSessionEntity session = sessionRepository.findById(sessionId)
                .orElseThrow(() -> new ResourceNotFoundException("Sesión IA no encontrada: " + sessionId));
        AiConversationMessageEntity msg = AiConversationMessageEntity.builder()
                .session(session)
                .role(role != null ? role : "user")
                .content(content != null ? content : "")
                .createdAt(Instant.now())
                .build();
        messageRepository.save(msg);
        session.setUpdatedAt(Instant.now());
        sessionRepository.save(session);
    }

    @Override
    @Transactional(readOnly = true)
    public List<MemoryMessage> recentMessages(String sessionId, int limit) {
        int size = Math.max(1, Math.min(limit, 100));
        List<AiConversationMessageEntity> desc = messageRepository
                .findBySession_IdOrderByCreatedAtDesc(sessionId, PageRequest.of(0, size));
        List<MemoryMessage> chronological = new ArrayList<>(desc.stream()
                .map(m -> new MemoryMessage(m.getRole(), m.getContent()))
                .toList());
        Collections.reverse(chronological);
        return chronological;
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> findSession(String sessionId) {
        return sessionRepository.findById(sessionId).map(AiConversationSessionEntity::getId);
    }
}
