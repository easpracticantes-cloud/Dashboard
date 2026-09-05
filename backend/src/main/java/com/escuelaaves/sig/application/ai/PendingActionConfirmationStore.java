package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.ActionSafetyClass;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Reserva de confirmaciones para la siguiente fase de Ave.
 * No se usa aún desde el chat de texto; queda listo para voz/acciones.
 */
@Component
public class PendingActionConfirmationStore {

    private final Map<String, PendingActionConfirmation> byId = new ConcurrentHashMap<>();
    private final Clock clock;
    private final Duration ttl;

    public PendingActionConfirmationStore() {
        this(Clock.systemUTC(), Duration.ofMinutes(10));
    }

    PendingActionConfirmationStore(Clock clock, Duration ttl) {
        this.clock = clock;
        this.ttl = ttl;
    }

    public PendingActionConfirmation put(String sessionId, ActionToolType tool, String summary) {
        String id = UUID.randomUUID().toString();
        ActionSafetyClass safety = tool.safetyClass();
        PendingActionConfirmation pending = new PendingActionConfirmation(
                id,
                sessionId,
                tool.name(),
                summary,
                safety,
                clock.instant().plus(ttl)
        );
        byId.put(id, pending);
        return pending;
    }

    public Optional<PendingActionConfirmation> consume(String sessionId, String confirmationId) {
        if (confirmationId == null || confirmationId.isBlank()) {
            return Optional.empty();
        }
        PendingActionConfirmation pending = byId.get(confirmationId.trim());
        if (pending == null || pending.expired(clock.instant()) || !pending.matches(sessionId, confirmationId)) {
            return Optional.empty();
        }
        byId.remove(confirmationId.trim());
        return Optional.of(pending);
    }
}
