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
 * Resuelve el proveedor de IA configurado. Si está DISABLED, hace failover a otro READY
 * (Claude → Gemini u otros) para que el chat general no quede atrapado en un stub local.
 */
@Slf4j
@Component
public class DefaultAiProviderFactory implements AiProviderFactory {

    private static final List<AiProviderType> FAILOVER_ORDER = List.of(
            AiProviderType.CLAUDE,
            AiProviderType.GEMINI,
            AiProviderType.OPENAI,
            AiProviderType.DEEPSEEK
    );

    private final Map<AiProviderType, GenerativeAiPort> providers = new EnumMap<>(AiProviderType.class);
    private final AiProviderType preferredType;

    public DefaultAiProviderFactory(
            List<GenerativeAiPort> allProviders,
            @Value("${app.ai.provider:anthropic}") String provider
    ) {
        for (GenerativeAiPort port : allProviders) {
            AiProviderType type = AiProviderType.from(port.providerId());
            providers.put(type, port);
        }
        this.preferredType = AiProviderType.from(provider);
        log.info("[AI] Preferido={} (config={}) registrados={}",
                preferredType.id(), provider, providers.keySet());

        GenerativeAiPort preferred = providers.get(preferredType);
        if (preferred != null && !isUsable(preferred)) {
            Optional<GenerativeAiPort> alt = findAlternateReady(preferred);
            if (alt.isPresent()) {
                log.warn("[AI] Preferido '{}' DISABLED → failover a '{}'",
                        preferredType.id(), alt.get().providerId());
            } else {
                log.warn("[AI] Preferido '{}' DISABLED y no hay otro proveedor READY. "
                                + "Define ANTHROPIC_API_KEY o GEMINI_API_KEY.",
                        preferredType.id());
            }
        }
    }

    @Override
    public GenerativeAiPort getActiveProvider() {
        GenerativeAiPort preferred = providers.get(preferredType);
        if (preferred != null && isUsable(preferred)) {
            return preferred;
        }
        Optional<GenerativeAiPort> alt = findAlternateReady(preferred);
        if (alt.isPresent()) {
            return alt.get();
        }
        if (preferred != null) {
            // Deja que el adapter lance el error de configuración al llamar chat()
            return preferred;
        }
        throw new BadRequestException(
                "No hay proveedor de IA registrado. Configura APP_AI_PROVIDER=anthropic y ANTHROPIC_API_KEY."
        );
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
        GenerativeAiPort active = getActiveProvider();
        return AiProviderType.from(active.providerId());
    }

    @Override
    public Optional<GenerativeAiPort> findAlternateReady(GenerativeAiPort exclude) {
        String excludeId = exclude != null ? exclude.providerId() : null;
        for (AiProviderType type : FAILOVER_ORDER) {
            GenerativeAiPort port = providers.get(type);
            if (port == null || !isUsable(port)) {
                continue;
            }
            if (excludeId != null && excludeId.equalsIgnoreCase(port.providerId())) {
                continue;
            }
            return Optional.of(port);
        }
        for (GenerativeAiPort port : providers.values()) {
            if (port != null && isUsable(port)
                    && (excludeId == null || !excludeId.equalsIgnoreCase(port.providerId()))) {
                return Optional.of(port);
            }
        }
        return Optional.empty();
    }

    @Override
    public List<GenerativeAiPort> readyProviders() {
        List<GenerativeAiPort> ready = new ArrayList<>();
        for (AiProviderType type : FAILOVER_ORDER) {
            GenerativeAiPort port = providers.get(type);
            if (port != null && isUsable(port)) {
                ready.add(port);
            }
        }
        return ready;
    }

    private static boolean isUsable(GenerativeAiPort port) {
        IntegrationStatus status = port.status();
        return status == IntegrationStatus.READY || status == IntegrationStatus.CONNECTED;
    }
}
