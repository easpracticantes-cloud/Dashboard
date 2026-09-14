package com.escuelaaves.sig.application.dto.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuoteDraftDto;

import java.util.List;
import java.util.UUID;

/**
 * DTOs del módulo Cotizaciones inteligentes.
 * Independiente de WhatsApp: cliente SIG + instrucción del asesor + catálogo.
 */
public final class IntelligentQuoteDtos {

    private IntelligentQuoteDtos() {
    }

    public record CreateIntelligentQuoteRequest(
            UUID clientId,
            String instructions,
            String advisorName,
            String serviceDate,
            String validUntil,
            String clientNameOverride,
            String clientDocumentOverride,
            String clientPhoneOverride,
            String clientEmailOverride,
            String clientCityOverride,
            String clientAddressOverride,
            List<String> preferredServiceHints
    ) {
    }

    public record MissingInfo(
            String field,
            String severity,
            String message
    ) {
    }

    public record FieldTrace(
            String field,
            String source,
            String confidence,
            String evidence
    ) {
    }

    public record CatalogMatchOption(
            String code,
            String name,
            String modality,
            java.math.BigDecimal unitPrice,
            Integer people
    ) {
    }

    public record IntelligentQuoteResponse(
            UUID id,
            String status,
            QuoteDraftDto document,
            List<MissingInfo> missingInformation,
            List<String> warnings,
            String confidence,
            List<FieldTrace> trace,
            List<CatalogMatchOption> alternativeMatches,
            String stageMessage
    ) {
    }

    public record RecalculateRequest(
            QuoteDraftDto document
    ) {
    }

    public record ApproveIntelligentQuoteRequest(
            QuoteDraftDto document,
            UUID clientId,
            UUID advisorId
    ) {
    }

    public record ApproveIntelligentQuoteResponse(
            UUID intelligentQuoteId,
            UUID commercialQuoteId,
            String quoteCode,
            QuoteDraftDto document
    ) {
    }
}
