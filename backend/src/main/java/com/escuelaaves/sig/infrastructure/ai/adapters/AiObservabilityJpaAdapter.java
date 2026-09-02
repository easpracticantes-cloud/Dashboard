package com.escuelaaves.sig.infrastructure.ai.adapters;

import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiUsageLogEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.AiUsageLogJpaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;

@Slf4j
@Component
@RequiredArgsConstructor
public class AiObservabilityJpaAdapter implements AiObservabilityPort {

    private final AiUsageLogJpaRepository repository;

    @Override
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AiUsageEvent event) {
        if (event == null) {
            return;
        }
        try {
            BigDecimal cost = null;
            if (event.estimatedCostUsd() != null) {
                cost = BigDecimal.valueOf(event.estimatedCostUsd()).setScale(8, RoundingMode.HALF_UP);
            }
            repository.save(AiUsageLogEntity.builder()
                    .userId(event.userId())
                    .endpoint(event.endpoint())
                    .operation(event.operation())
                    .provider(event.provider() != null ? event.provider() : "unknown")
                    .model(event.model())
                    .latencyMs(event.latencyMs())
                    .estimatedTokens(event.estimatedTokens())
                    .inputTokens(event.inputTokens())
                    .outputTokens(event.outputTokens())
                    .estimatedCostUsd(cost)
                    .modelTier(event.modelTier())
                    .success(event.success())
                    .errorMessage(truncate(event.errorMessage()))
                    .createdAt(Instant.now())
                    .build());
            log.info("[AI-Obs] op={} provider={} model={} tier={} tokens={} costUsd={} success={} latencyMs={}",
                    event.operation(), event.provider(), event.model(), event.modelTier(),
                    event.estimatedTokens(), event.estimatedCostUsd(), event.success(), event.latencyMs());
        } catch (Exception ex) {
            log.warn("[AI-Obs] No se pudo persistir uso: {}", ex.getMessage());
        }
    }

    private static String truncate(String value) {
        if (value == null) {
            return null;
        }
        return value.length() <= 500 ? value : value.substring(0, 500);
    }
}
