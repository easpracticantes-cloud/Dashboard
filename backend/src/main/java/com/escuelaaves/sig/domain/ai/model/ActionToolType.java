package com.escuelaaves.sig.domain.ai.model;

/**
 * Catálogo de herramientas ejecutables por el asistente operativo (function-calling interno).
 */
public enum ActionToolType {
    FIND_OR_CREATE_CLIENT(true, ActionSafetyClass.MUTATING),
    CREATE_RESERVATION(true, ActionSafetyClass.MUTATING),
    CANCEL_RESERVATION(true, ActionSafetyClass.MUTATING),
    QUOTE_NATURAL_LANGUAGE(false, ActionSafetyClass.READ_ONLY),
    RESOLVE_CHECKLIST(false, ActionSafetyClass.READ_ONLY),
    SUGGEST_PROVIDERS(false, ActionSafetyClass.READ_ONLY),
    ASSIGN_CONVERSATION(true, ActionSafetyClass.MUTATING),
    SET_CONVERSATION_STATUS(true, ActionSafetyClass.MUTATING),
    SET_CONVERSATION_PRIORITY(true, ActionSafetyClass.MUTATING),
    SEND_CONVERSATION_MESSAGE(true, ActionSafetyClass.EXTERNAL_ACTION),
    GENERATE_QUOTE_FROM_CONVERSATION(true, ActionSafetyClass.MUTATING),
    STUB_CREATE_DRIVE_FOLDER(true, ActionSafetyClass.EXTERNAL_ACTION);

    private final boolean mutating;
    private final ActionSafetyClass safetyClass;

    ActionToolType(boolean mutating, ActionSafetyClass safetyClass) {
        this.mutating = mutating;
        this.safetyClass = safetyClass;
    }

    public boolean mutating() {
        return mutating;
    }

    public ActionSafetyClass safetyClass() {
        return safetyClass;
    }

    public boolean requiresExplicitConfirm() {
        return safetyClass.requiresExplicitConfirm();
    }

    public static ActionToolType from(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("tool vacío");
        }
        String n = raw.trim().toUpperCase().replace('-', '_');
        return ActionToolType.valueOf(n);
    }
}
