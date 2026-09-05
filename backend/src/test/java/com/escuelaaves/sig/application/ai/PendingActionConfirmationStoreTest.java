package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.domain.ai.model.ActionSafetyClass;
import com.escuelaaves.sig.domain.ai.model.ActionToolType;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.*;

class PendingActionConfirmationStoreTest {

    @Test
    void consumeRequiresSameSessionAndId() {
        PendingActionConfirmationStore store = new PendingActionConfirmationStore();
        var pending = store.put("sess-1", ActionToolType.SEND_CONVERSATION_MESSAGE, "Enviar cotización #123");

        assertEquals(ActionSafetyClass.EXTERNAL_ACTION, pending.safety());
        assertTrue(pending.safety().requiresExplicitConfirm());
        assertTrue(store.consume("other", pending.confirmationId()).isEmpty());
        assertTrue(store.consume("sess-1", "si").isEmpty());
        assertTrue(store.consume("sess-1", pending.confirmationId()).isPresent());
        assertTrue(store.consume("sess-1", pending.confirmationId()).isEmpty());
    }

    @Test
    void expiredTokenIsRejected() {
        Clock fixed = Clock.fixed(Instant.parse("2026-09-05T00:00:00Z"), ZoneOffset.UTC);
        PendingActionConfirmationStore store = new PendingActionConfirmationStore(fixed, Duration.ofSeconds(1));
        var pending = store.put("sess-1", ActionToolType.CREATE_RESERVATION, "Crear reserva");
        PendingActionConfirmationStore later = new PendingActionConfirmationStore(
                Clock.fixed(Instant.parse("2026-09-05T00:00:05Z"), ZoneOffset.UTC),
                Duration.ofSeconds(1)
        );
        later.put("sess-x", ActionToolType.RESOLVE_CHECKLIST, "noop");
        assertTrue(pending.expired(Instant.parse("2026-09-05T00:00:05Z")));
    }

    @Test
    void readOnlyToolsDoNotNeedConfirm() {
        assertFalse(ActionToolType.QUOTE_NATURAL_LANGUAGE.requiresExplicitConfirm());
        assertTrue(ActionToolType.FIND_OR_CREATE_CLIENT.requiresExplicitConfirm());
        assertEquals(ActionSafetyClass.EXTERNAL_ACTION, ActionToolType.SEND_CONVERSATION_MESSAGE.safetyClass());
    }
}
