package com.escuelaaves.sig.domain.ai.port;

import com.escuelaaves.sig.domain.ai.model.AiProviderType;

import java.util.List;
import java.util.Optional;

/**
 * Factory que resuelve el proveedor de IA activo sin acoplar la aplicación a un vendor.
 */
public interface AiProviderFactory {

    GenerativeAiPort getActiveProvider();

    GenerativeAiPort getProvider(AiProviderType type);

    /** Tipo efectivamente usable (tras failover si el preferido está DISABLED). */
    AiProviderType activeType();

    /** Otro proveedor READY distinto de {@code exclude}, o empty. */
    Optional<GenerativeAiPort> findAlternateReady(GenerativeAiPort exclude);

    List<GenerativeAiPort> readyProviders();
}
