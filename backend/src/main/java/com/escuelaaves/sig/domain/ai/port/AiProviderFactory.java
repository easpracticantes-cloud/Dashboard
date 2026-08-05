package com.escuelaaves.sig.domain.ai.port;

import com.escuelaaves.sig.domain.ai.model.AiProviderType;

/**
 * Factory que resuelve el proveedor de IA activo sin acoplar la aplicación a Gemini.
 */
public interface AiProviderFactory {

    GenerativeAiPort getActiveProvider();

    GenerativeAiPort getProvider(AiProviderType type);

    AiProviderType activeType();
}
