package com.escuelaaves.sig.application.dto.ai;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

/**
 * DTOs de entrada/salida del módulo de IA generativa (API HTTP).
 */
public final class AiModuleDtos {

    private AiModuleDtos() {
    }

    public record ChatRequest(
            @NotBlank String message,
            String systemPrompt
    ) {
    }

    public record ChatResponse(
            String reply,
            String model,
            boolean success,
            String message
    ) {
    }

    public record QuotationRequest(
            @NotBlank String message,
            Boolean generateNarrative
    ) {
        /** Por defecto genera correo + texto natural tras el pricing. */
        public boolean shouldGenerateNarrative() {
            return generateNarrative == null || Boolean.TRUE.equals(generateNarrative);
        }
    }

    public record ChecklistItemDto(
            String code,
            String label,
            String category,
            boolean required,
            int sortOrder
    ) {
    }

    public record ProviderRecommendationDto(
            String code,
            String name,
            String category,
            String tourCode,
            String notes,
            int priority
    ) {
    }

    /**
     * Respuesta del endpoint quotation: interpretación IA + precios PostgreSQL + narrativa opcional.
     * Campos enterprise opcionales al final (compatibilidad hacia adelante).
     */
    public record QuotationResponse(
            String tour,
            Integer people,
            String date,
            String pickup,
            Boolean transport,
            Boolean restaurant,
            String tourName,
            java.math.BigDecimal pricePerPerson,
            java.math.BigDecimal transportPerPerson,
            java.math.BigDecimal restaurantPerPerson,
            java.math.BigDecimal subtotalTour,
            java.math.BigDecimal subtotalTransport,
            java.math.BigDecimal subtotalRestaurant,
            java.math.BigDecimal total,
            String currency,
            String emailSubject,
            String emailBody,
            String quotationText,
            String notes,
            List<String> rulesApplied,
            List<ChecklistItemDto> checklist,
            List<ProviderRecommendationDto> recommendations
    ) {
    }

    public record DashboardSummaryRequest(String context) {
    }

    public record DashboardSummaryResponse(
            String summary,
            String sentiment,
            String urgency,
            String provider
    ) {
    }

    public record ChecklistResponse(
            String tourCode,
            String title,
            List<ChecklistItemDto> items
    ) {
    }

    public record ProviderRecommendationRequest(
            String tourCode,
            String category
    ) {
    }

    public record ActionExecuteRequest(
            @NotBlank String instruction,
            String contextJson,
            Boolean dryRun,
            Boolean confirm
    ) {
        public boolean dryRunOrDefault() {
            return dryRun == null || Boolean.TRUE.equals(dryRun);
        }

        public boolean confirmOrFalse() {
            return Boolean.TRUE.equals(confirm);
        }
    }

    public record ActionStepDto(
            String tool,
            boolean success,
            boolean skipped,
            boolean dryRun,
            String message,
            java.util.Map<String, Object> data
    ) {
    }

    public record ActionExecuteResponse(
            String rationale,
            java.util.List<ActionStepDto> results,
            String narrative,
            boolean executed,
            boolean dryRun,
            java.util.List<String> plannedTools
    ) {
    }
}
