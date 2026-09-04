package com.escuelaaves.sig.application.ai;

import com.escuelaaves.sig.application.dto.ai.AiModuleDtos;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChatResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ChecklistItemDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.DashboardSummaryRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.DashboardSummaryResponse;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.ProviderRecommendationDto;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.QuotationResponse;
import com.escuelaaves.sig.domain.ai.model.ConversationClassification;
import com.escuelaaves.sig.domain.ai.model.LanguageDetection;
import com.escuelaaves.sig.domain.ai.model.NaturalLanguageQuotation;
import com.escuelaaves.sig.domain.ai.model.PricedQuotation;
import com.escuelaaves.sig.domain.ai.model.QuoteInterpretation;
import com.escuelaaves.sig.domain.ai.model.ReservationExtraction;
import com.escuelaaves.sig.domain.ai.model.SentimentAnalysis;
import com.escuelaaves.sig.domain.ai.port.AiProviderFactory;
import com.escuelaaves.sig.domain.ai.port.GenerativeAiPort;
import com.escuelaaves.sig.domain.ai.port.out.AiObservabilityPort;
import com.escuelaaves.sig.domain.ai.port.out.AnalyticsInsightPort;
import com.escuelaaves.sig.domain.ai.port.out.ChecklistPort;
import com.escuelaaves.sig.domain.ai.port.out.ConversationMemoryPort;
import com.escuelaaves.sig.domain.ai.port.out.RecommendationPort;
import com.escuelaaves.sig.domain.ai.port.out.WhatsAppAiAssistPort;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotRequest;
import com.escuelaaves.sig.application.dto.ai.AiModuleDtos.CopilotResponse;
import com.escuelaaves.sig.domain.ai.model.ActionPlanOutcome;
import com.escuelaaves.sig.domain.port.in.AIUseCase;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.AiUsageLogEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.AiUsageLogJpaRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Fachada única del Enterprise AI Engine.
 * Application no conoce Gemini: resuelve proveedor vía {@link AiProviderFactory}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IntelligenceService implements AIUseCase {

    private static final String DEFAULT_SYSTEM = AveSystemPrompt.SYSTEM;

    private final AiProviderFactory aiProviderFactory;
    private final QuotationOrchestrator quotationOrchestrator;
    private final ActionOrchestrator actionOrchestrator;
    private final CopilotOrchestrator copilotOrchestrator;
    private final ChecklistPort checklistPort;
    private final RecommendationPort recommendationPort;
    private final AiObservabilityPort observabilityPort;
    private final ConversationMemoryPort conversationMemoryPort;
    private final WhatsAppAiAssistPort whatsAppAiAssistPort;
    private final AnalyticsInsightPort analyticsInsightPort;
    private final AiUsageLogJpaRepository usageLogRepository;

    private GenerativeAiPort ai() {
        return aiProviderFactory.getActiveProvider();
    }

    @Override
    public ChatResponse chat(ChatRequest request) {
        return observe("chat", "/api/v1/ai/chat", () -> {
            String system = (request.systemPrompt() == null || request.systemPrompt().isBlank())
                    ? DEFAULT_SYSTEM
                    : request.systemPrompt();
            String reply = ai().chat(system, request.message());
            return new ChatResponse(reply, ai().providerId(), true, "OK");
        });
    }

    @Override
    public QuotationResponse quotation(QuotationRequest request) {
        return quotationOrchestrator.orchestrate(request);
    }

    @Override
    public QuoteInterpretation interpretQuote(String message) {
        return observe("interpretQuote", "/api/v1/ai/interpret-quote", () -> ai().interpretQuote(message));
    }

    @Override
    public String summarizeConversation(String conversationText) {
        return observe("summarize", "/api/v1/ai/summarize", () -> ai().summarizeConversation(conversationText));
    }

    @Override
    public ConversationClassification classifyConversation(String conversationText) {
        return observe("classify", "/api/v1/ai/classify", () -> ai().classifyConversation(conversationText));
    }

    @Override
    public String generateEmail(String context) {
        return observe("generateEmail", "/api/v1/ai/generate-email", () -> ai().generateEmail(context));
    }

    @Override
    public NaturalLanguageQuotation generateQuotation(PricedQuotation priced) {
        return observe("generateQuotation", "/api/v1/ai/quotation", () -> ai().generateQuotationNarrative(priced));
    }

    @Override
    public ReservationExtraction extractReservationInformation(String message) {
        return observe("extractReservation", "/api/v1/ai/extract-reservation",
                () -> ai().extractReservationInformation(message));
    }

    @Override
    public LanguageDetection detectLanguage(String text) {
        return observe("detectLanguage", "/api/v1/ai/detect-language", () -> ai().detectLanguage(text));
    }

    @Override
    public SentimentAnalysis analyzeSentiment(String text) {
        return observe("analyzeSentiment", "/api/v1/ai/analyze-sentiment", () -> ai().analyzeSentiment(text));
    }

    @Override
    public String suggestReply(String conversationText) {
        return observe("suggestReply", "/api/v1/ai/suggest-reply", () -> ai().suggestReply(conversationText));
    }

    public DashboardSummaryResponse dashboardSummary(DashboardSummaryRequest request) {
        return observe("dashboardSummary", "/api/v1/ai/dashboard-summary", () -> {
            String text = request != null && request.context() != null ? request.context() : "";
            String summary = ai().summarizeConversation(text.isBlank()
                    ? "Sin contexto adicional. Resume el estado operativo típico de un día comercial en Escuela Aves Salento."
                    : text);
            SentimentAnalysis sentiment = text.isBlank()
                    ? new SentimentAnalysis("NEUTRAL", 0.5, "OPS", "MEDIUM")
                    : ai().analyzeSentiment(text);
            return new DashboardSummaryResponse(summary, sentiment.sentiment(), sentiment.urgency(), ai().providerId());
        });
    }

    public List<ProviderRecommendationDto> providerRecommendation(String tourCode, String category) {
        return recommendationPort.suggest(tourCode, category).stream()
                .map(r -> new ProviderRecommendationDto(
                        r.code(), r.name(), r.category(), r.tourCode(), r.notes(), r.priority()))
                .toList();
    }

    public AiModuleDtos.ChecklistResponse checklist(String tourCode) {
        ChecklistPort.Checklist c = checklistPort.resolve(tourCode);
        List<ChecklistItemDto> items = c.items().stream()
                .map(i -> new ChecklistItemDto(i.code(), i.label(), i.category(), i.required(), i.sortOrder()))
                .toList();
        return new AiModuleDtos.ChecklistResponse(c.tourCode(), c.title(), items);
    }

    public Map<String, Object> providerStatus() {
        GenerativeAiPort provider = ai();
        return Map.of(
                "provider", provider.providerId(),
                "code", provider.code().name(),
                "status", provider.status().name(),
                "activeType", aiProviderFactory.activeType().id()
        );
    }

    public String startMemorySession(Long userId, String title) {
        return conversationMemoryPort.startSession(userId, title);
    }

    public void appendMemory(String sessionId, String role, String content) {
        conversationMemoryPort.appendMessage(sessionId, role, content);
    }

    public List<ConversationMemoryPort.MemoryMessage> memoryMessages(String sessionId, int limit) {
        return conversationMemoryPort.recentMessages(sessionId, limit);
    }

    public Map<String, String> whatsappAutoReply(String conversationText) {
        return observe("whatsappAutoReply", "/api/v1/ai/whatsapp/auto-reply", () -> Map.of(
                "reply", whatsAppAiAssistPort.draftAutoReply(conversationText),
                "priority", whatsAppAiAssistPort.prioritizeCustomer(conversationText)
        ));
    }

    public AnalyticsInsightPort.AnalyticsInsight insights(String context) {
        return observe("insights", "/api/v1/ai/insights", () -> analyticsInsightPort.generate(context));
    }

    public ActionPlanOutcome executeActions(String instruction, String contextJson, boolean dryRun, boolean confirm) {
        return actionOrchestrator.run(instruction, contextJson, dryRun, confirm);
    }

    public CopilotResponse copilot(CopilotRequest request) {
        return copilotOrchestrator.chat(request);
    }

    public void copilotStream(
            CopilotRequest request,
            java.util.function.Consumer<String> onDelta,
            java.util.function.Consumer<CopilotResponse> onDone
    ) {
        copilotOrchestrator.chatStreaming(request, onDelta, onDone);
    }

    @Transactional(readOnly = true)
    public List<Map<String, Object>> recentUsage() {
        return usageLogRepository.findTop50ByOrderByCreatedAtDesc().stream()
                .map(this::toUsageMap)
                .toList();
    }

    private Map<String, Object> toUsageMap(AiUsageLogEntity e) {
        java.util.HashMap<String, Object> map = new java.util.HashMap<>();
        map.put("id", e.getId() != null ? e.getId() : 0);
        map.put("operation", e.getOperation() != null ? e.getOperation() : "");
        map.put("provider", e.getProvider() != null ? e.getProvider() : "");
        map.put("endpoint", e.getEndpoint() != null ? e.getEndpoint() : "");
        map.put("model", e.getModel() != null ? e.getModel() : "");
        map.put("modelTier", e.getModelTier() != null ? e.getModelTier() : "");
        map.put("latencyMs", e.getLatencyMs() != null ? e.getLatencyMs() : 0);
        map.put("estimatedTokens", e.getEstimatedTokens() != null ? e.getEstimatedTokens() : 0);
        map.put("inputTokens", e.getInputTokens() != null ? e.getInputTokens() : 0);
        map.put("outputTokens", e.getOutputTokens() != null ? e.getOutputTokens() : 0);
        map.put("estimatedCostUsd", e.getEstimatedCostUsd() != null ? e.getEstimatedCostUsd() : 0);
        map.put("success", e.isSuccess());
        map.put("createdAt", e.getCreatedAt() != null ? e.getCreatedAt().toString() : "");
        return map;
    }

    private <T> T observe(String operation, String endpoint, Supplier<T> action) {
        long start = System.currentTimeMillis();
        boolean success = true;
        String error = null;
        String provider = aiProviderFactory.activeType().id();
        try {
            return action.get();
        } catch (RuntimeException ex) {
            success = false;
            error = ex.getMessage();
            throw ex;
        } finally {
            observabilityPort.record(new AiObservabilityPort.AiUsageEvent(
                    null, endpoint, operation, provider, null,
                    System.currentTimeMillis() - start, null, success, error
            ));
        }
    }
}
