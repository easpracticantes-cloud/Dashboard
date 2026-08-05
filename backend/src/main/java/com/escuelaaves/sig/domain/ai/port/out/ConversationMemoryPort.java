package com.escuelaaves.sig.domain.ai.port.out;

import java.util.List;
import java.util.Optional;

public interface ConversationMemoryPort {

    String startSession(Long userId, String title);

    void appendMessage(String sessionId, String role, String content);

    List<MemoryMessage> recentMessages(String sessionId, int limit);

    Optional<String> findSession(String sessionId);

    record MemoryMessage(String role, String content) {
    }
}
