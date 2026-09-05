package com.escuelaaves.sig.domain.ai.model;

/**
 * Clasificación de tools de Ave para la fase de confirmación.
 * READ_ONLY se ejecuta sin confirmación extra.
 * MUTATING y EXTERNAL_ACTION exigen confirm=true atado a la acción.
 */
public enum ActionSafetyClass {
    READ_ONLY,
    MUTATING,
    EXTERNAL_ACTION;

    public boolean requiresExplicitConfirm() {
        return this == MUTATING || this == EXTERNAL_ACTION;
    }
}
