package com.escuelaaves.sig.infrastructure.ai.config;

import com.escuelaaves.sig.domain.ai.model.AiProviderType;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.shared.exception.BadRequestException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class DefaultAiProviderFactory implements AiProviderFactory {

    private final Map<AiProviderType, GenerativeAiPort> providers = new EnumMap<>(AiProviderType.class);
    private final AiProviderType activeType;

    public DefaultAiProviderFactory(
            List<GenerativeAiPort> allProviders,
            @Value("${app.ai.provider:gemini}") String provider
    ) {
        for (GenerativeAiPort port : allProviders) {
            AiProviderType type = AiProviderType.from(port.providerId());
            providers.put(type, port);
        }
        this.activeType = AiProviderType.from(provider);
        log.info("[AI] Proveedor activo={} disponibles={}", activeType.id(), providers.keySet());
    }

    @Override
    public GenerativeAiPort getActiveProvider() {
        return getProvider(activeType);
    }

    @Override
    public GenerativeAiPort getProvider(AiProviderType type) {
        GenerativeAiPort port = providers.get(type);
        if (port == null) {
            throw new BadRequestException("Proveedor IA no registrado: " + type);
        }
        return port;
    }

    @Override
    public AiProviderType activeType() {
        return activeType;
    }
}
