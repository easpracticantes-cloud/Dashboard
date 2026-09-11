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
            Boolean confirm,
            String sessionId,
            String confirmationId
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
            java.util.List<String> plannedTools,
            String confirmationId
    ) {
        public ActionExecuteResponse(
                String rationale,
                java.util.List<ActionStepDto> results,
                String narrative,
                boolean executed,
                boolean dryRun,
                java.util.List<String> plannedTools
        ) {
            this(rationale, results, narrative, executed, dryRun, plannedTools, null);
        }
    }

    public record CopilotRequest(
            @NotBlank String message,
            String sessionId,
            String uiContext
    ) {
        public CopilotRequest(String message, String sessionId) {
            this(message, sessionId, null);
        }
    }

    /**
     * Línea estructurada de cotización. La IA solo llena datos, nunca HTML.
     */
    public record QuoteLineItemDto(
            String description,
            Integer quantity,
            String unit,
            java.math.BigDecimal unitPrice,
            java.math.BigDecimal discount,
            java.math.BigDecimal iva,
            java.math.BigDecimal total
    ) {
    }

    /**
     * Borrador de cotización para revisión en UI (editable + PDF).
     */
    public record QuoteDraftDto(
            String code,
            String name,
            String modality,
            Integer people,
            java.math.BigDecimal unitPrice,
            java.math.BigDecimal total,
            String currency,
            String date,
            String pickup,
            String clientName,
            String notes,
            String includes,
            String excludes,
            boolean reviewFlag,
            java.util.Map<String, java.math.BigDecimal> priceScaleByPax,
            java.util.List<QuoteLineItemDto> items,
            String clientNit,
            String clientPhone,
            String clientEmail,
            String clientCity,
            String clientContact,
            String clientAddress,
            String advisorName,
            String quoteNumber,
            String issuedAt,
            String validUntil,
            String observations,
            String commercialConditions,
            String status
    ) {
        public QuoteDraftDto(
                String code,
                String name,
                String modality,
                Integer people,
                java.math.BigDecimal unitPrice,
                java.math.BigDecimal total,
                String currency,
                String date,
                String pickup,
                String clientName,
                String notes,
                String includes,
                String excludes,
                boolean reviewFlag,
                java.util.Map<String, java.math.BigDecimal> priceScaleByPax
        ) {
            this(
                    code, name, modality, people, unitPrice, total, currency, date, pickup,
                    clientName, notes, includes, excludes, reviewFlag, priceScaleByPax,
                    null, null, null, null, null, null, null, null, null, null, null,
                    null, null, "DRAFT"
            );
        }
    }

    public record QuoteDocumentResponse(
            QuoteDraftDto document,
            java.util.List<String> errors,
            boolean valid
    ) {
    }

    public record CopilotResponse(
            String sessionId,
            String reply,
            String mode,
            java.util.List<String> toolsUsed,
            String provider,
            boolean success,
            QuoteDraftDto quoteDraft
    ) {
        public CopilotResponse(
                String sessionId,
                String reply,
                String mode,
                java.util.List<String> toolsUsed,
                String provider,
                boolean success
        ) {
            this(sessionId, reply, mode, toolsUsed, provider, success, null);
        }
    }
}
