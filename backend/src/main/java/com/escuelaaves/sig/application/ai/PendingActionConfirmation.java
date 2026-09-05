package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.ActionSafetyClass;

import java.time.Instant;

/**
 * Confirmación atada a UNA acción concreta. Un "sí" suelto no vale:
 * hay que presentar el mismo confirmationId.
 */
public record PendingActionConfirmation(
        String confirmationId,
        String sessionId,
        String tool,
        String summary,
        ActionSafetyClass safety,
        Instant expiresAt
) {
    public boolean matches(String session, String spokenOrId) {
        if (session == null || !session.equals(sessionId)) {
            return false;
        }
        if (spokenOrId == null) {
            return false;
        }
        return confirmationId.equals(spokenOrId.trim());
    }

    public boolean expired(Instant now) {
        return now.isAfter(expiresAt);
    }
}
