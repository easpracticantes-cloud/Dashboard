package com.escuelaaves.sig.infrastructure.ai.config;

import com.escuelaaves.sig.domain.ai.model.AiProviderType;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Resuelve el proveedor de IA. Solo Claude (Anthropic) está habilitado.
 */
@Slf4j
@Component
public class DefaultAiProviderFactory implements AiProviderFactory {

    private final Map<AiProviderType, GenerativeAiPort> providers = new EnumMap<>(AiProviderType.class);

    public DefaultAiProviderFactory(
            List<GenerativeAiPort> allProviders,
            @Value("${app.ai.provider:anthropic}") String provider
    ) {
        for (GenerativeAiPort port : allProviders) {
            AiProviderType type = AiProviderType.from(port.providerId());
            providers.put(type, port);
        }
        log.info("[AI] Proveedor=claude (config={}) registrados={}", provider, providers.keySet());
        GenerativeAiPort claude = providers.get(AiProviderType.CLAUDE);
        if (claude == null || !isUsable(claude)) {
            log.warn("[AI] Claude DISABLED. Define ANTHROPIC_API_KEY y, si aplica, ANTHROPIC_WORKSPACE_ID.");
        }
    }

    @Override
    public GenerativeAiPort getActiveProvider() {
        GenerativeAiPort claude = providers.get(AiProviderType.CLAUDE);
        if (claude != null) {
            return claude;
        }
        throw new BadRequestException(
                "No hay proveedor Claude registrado. Configura APP_AI_PROVIDER=anthropic y ANTHROPIC_API_KEY."
        );
    }

    @Override
    public GenerativeAiPort getProvider(AiProviderType type) {
        if (type != AiProviderType.CLAUDE) {
            throw new BadRequestException("Solo Claude está habilitado. Proveedor pedido: " + type);
        }
        return getActiveProvider();
    }

    @Override
    public AiProviderType activeType() {
        return AiProviderType.CLAUDE;
    }

    @Override
    public Optional<GenerativeAiPort> findAlternateReady(GenerativeAiPort exclude) {
        return Optional.empty();
    }

    @Override
    public List<GenerativeAiPort> readyProviders() {
        List<GenerativeAiPort> ready = new ArrayList<>();
        GenerativeAiPort claude = providers.get(AiProviderType.CLAUDE);
        if (claude != null && isUsable(claude)) {
            ready.add(claude);
        }
        return ready;
    }

    private static boolean isUsable(GenerativeAiPort port) {
        IntegrationStatus status = port.status();
        return status == IntegrationStatus.READY || status == IntegrationStatus.CONNECTED;
    }
}
