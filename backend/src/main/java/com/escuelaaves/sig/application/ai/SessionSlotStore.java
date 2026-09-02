package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.SessionSlotState;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Almacén en memoria de slots por sessionId (Ave).
 */
@Component
public class SessionSlotStore {

    private final Map<String, SessionSlotState> bySession = new ConcurrentHashMap<>();

    public SessionSlotState getOrCreate(String sessionId) {
        String key = (sessionId == null || sessionId.isBlank()) ? "ephemeral" : sessionId.trim();
        return bySession.computeIfAbsent(key, k -> new SessionSlotState());
    }

    public void clear(String sessionId) {
        if (sessionId != null) {
            bySession.remove(sessionId.trim());
        }
    }
}
