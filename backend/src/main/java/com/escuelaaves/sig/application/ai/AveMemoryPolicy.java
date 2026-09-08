package com.escuelaaves.sig.application.ai;

/**
 * Política de memoria de Ave (fase 17).
 *
 * Conversacional: últimos 12 turnos de la sesión PostgreSQL existente.
 * Persistente: la misma tabla de sesión; no hay un segundo almacén.
 *
 * Se guarda: texto del usuario y respuesta de Ave.
 * No se guarda: uiContext, tokens, notas de Excel, contraseñas.
 * Acceso: JWT en /api/v1/ai/memory/**.
 * Borrado: DELETE /api/v1/ai/memory/{sessionId} o "Nueva conversación" en la UI.
 * TTL de confirmaciones de acción: 10 minutos en memoria de proceso (no PG).
 */
public final class AveMemoryPolicy {

    public static final int CONVERSATION_TURNS = 12;
    public static final String SENSITIVE = "uiContext, tokens, secretos y PII de pantalla no se persisten en el hilo";

    private AveMemoryPolicy() {
    }
}
