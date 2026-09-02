package com.escuelaaves.sig.domain.ai.model;

/**
 * Nivel de modelo LLM: económico (Haiku) vs razonamiento (Sonnet).
 * Las operaciones No-AI no pasan por aquí.
 */
public enum AiModelTier {
    FAST,
    REASONING
}
