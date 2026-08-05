package com.escuelaaves.sig.domain.ai.model;

/**
 * Catálogo de herramientas ejecutables por el asistente operativo (function-calling interno).
 */
public enum ActionToolType {
    FIND_OR_CREATE_CLIENT(true),
    CREATE_RESERVATION(true),
    CANCEL_RESERVATION(true),
    QUOTE_NATURAL_LANGUAGE(false),
    RESOLVE_CHECKLIST(false),
    SUGGEST_PROVIDERS(false),
    ASSIGN_CONVERSATION(true),
    SET_CONVERSATION_STATUS(true),
    SET_CONVERSATION_PRIORITY(true),
    SEND_CONVERSATION_MESSAGE(true),
    GENERATE_QUOTE_FROM_CONVERSATION(true),
    STUB_CREATE_DRIVE_FOLDER(true);

    private final boolean mutating;

    ActionToolType(boolean mutating) {
        this.mutating = mutating;
    }

    public boolean mutating() {
        return mutating;
    }

    public static ActionToolType from(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("tool vacío");
        }
        String n = raw.trim().toUpperCase().replace('-', '_');
        return ActionToolType.valueOf(n);
    }
}
