package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.GenerateQuoteRequest;
import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.QuoteDraft;
import com.escuelaaves.sig.application.dto.ai.AiQuoteDtos.QuoteSuggestion;
import com.escuelaaves.sig.application.dto.commercial.QuoteCreateRequest;
import com.escuelaaves.sig.application.dto.commercial.QuoteDto;
import com.escuelaaves.sig.domain.model.ChatQuoteContext;
import com.escuelaaves.sig.domain.model.ChatQuoteContext.ChatTurn;
import com.escuelaaves.sig.domain.model.CommercialStatus;
import com.escuelaaves.sig.domain.model.QuoteAnalysis;
import com.escuelaaves.sig.domain.model.SenderType;
import com.escuelaaves.sig.domain.port.in.AiQuoteUseCase;
import com.escuelaaves.sig.domain.port.out.ConversationRepositoryPort;
import com.escuelaaves.sig.domain.port.out.MessageRepositoryPort;
import com.escuelaaves.sig.domain.port.out.QuotePdfPort;
import com.escuelaaves.sig.domain.port.out.integration.ChatQuoteAnalyzerPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.MessageEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.QuoteEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository.QuoteJpaRepository;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AiQuoteService implements AiQuoteUseCase {

    private final ConversationRepositoryPort conversationRepositoryPort;
    private final MessageRepositoryPort messageRepositoryPort;
    private final ChatQuoteAnalyzerPort chatQuoteAnalyzerPort;
    private final CommercialService commercialService;
    private final QuoteJpaRepository quoteJpaRepository;
    private final QuotePdfPort quotePdfPort;

    @Value("${app.ai.quote.min-confidence:25}")
    private int minConfidence;

    @Override
    public QuoteSuggestion suggestForConversation(UUID conversationId) {
        ConversationEntity conversation = conversationRepositoryPort.findById(conversationId)
                .orElseThrow(() -> new ResourceNotFoundException("Conversación no encontrada"));
        List<MessageEntity> messages = messageRepositoryPort.findByConversationIdOrderBySentAtAsc(conversationId);

        boolean hasInbound = messages.stream()
                .anyMatch(m -> m.getSenderType() == SenderType.CLIENT);

        QuoteAnalysis analysis = chatQuoteAnalyzerPort.analyze(buildContext(conversation, messages));
        QuoteDraft draft = toDraft(analysis);

        boolean shouldAsk = hasInbound && !messages.isEmpty() && analysis.confidence() >= minConfidence;
        String clientName = conversation.getClient() != null ? conversation.getClient().getName() : "el cliente";
        String question = "¿Quieres que genere la cotización para " + clientName + "?";
        String reason = buildReason(analysis);

        return new QuoteSuggestion(shouldAsk, question, reason, conversationId, clientName, draft);
    }

    @Override
    @Transactional
    public QuoteDto generateForConversation(UUID conversationId, GenerateQuoteRequest overrides) {
        ConversationEntity conversation = conversationRepositoryPort.findById(conversationId)
                .orElseThrow(() -> new ResourceNotFoundException("Conversación no encontrada"));
        if (conversation.getClient() == null) {
            throw new ResourceNotFoundException("La conversación no tiene cliente asociado");
        }
        List<MessageEntity> messages = messageRepositoryPort.findByConversationIdOrderBySentAtAsc(conversationId);
        QuoteAnalysis analysis = chatQuoteAnalyzerPort.analyze(buildContext(conversation, messages));

        GenerateQuoteRequest safe = overrides != null
                ? overrides
                : new GenerateQuoteRequest(null, null, null, null, null, null, null, null);

        String title = firstNonBlank(safe.title(), analysis.title());
        String description = firstNonBlank(safe.description(), analysis.description());
        BigDecimal amount = safe.amount() != null ? safe.amount() : analysis.amount();
        String currency = firstNonBlank(safe.currency(), analysis.currency());
        LocalDate validUntil = analysis.validUntil() != null ? analysis.validUntil() : LocalDate.now().plusDays(15);

        QuoteCreateRequest request = new QuoteCreateRequest(
                conversation.getClient().getId(),
                safe.advisorId(),
                title,
                description,
                amount != null ? amount : BigDecimal.ZERO,
                currency,
                CommercialStatus.DRAFT,
                validUntil
        );
        return commercialService.createQuote(request);
    }

    @Override
    public byte[] exportQuotePdf(UUID quoteId) {
        QuoteEntity quote = quoteJpaRepository.findById(quoteId)
                .orElseThrow(() -> new ResourceNotFoundException("Cotización no encontrada"));
        return quotePdfPort.render(quote);
    }

    private ChatQuoteContext buildContext(ConversationEntity conversation, List<MessageEntity> messages) {
        List<ChatTurn> turns = new ArrayList<>();
        for (MessageEntity message : messages) {
            if (message.getBody() == null || message.getBody().isBlank()) {
                continue;
            }
            turns.add(new ChatTurn(message.getSenderType() == SenderType.CLIENT, message.getBody()));
        }
        String clientName = conversation.getClient() != null ? conversation.getClient().getName() : null;
        String phone = conversation.getClient() != null ? conversation.getClient().getPhone() : null;
        return new ChatQuoteContext(clientName, phone, turns);
    }

    private QuoteDraft toDraft(QuoteAnalysis analysis) {
        return new QuoteDraft(
                analysis.experience(),
                analysis.title(),
                analysis.description(),
                analysis.partySize(),
                analysis.amount(),
                analysis.currency(),
                analysis.serviceDate(),
                analysis.validUntil(),
                analysis.confidence(),
                analysis.analyzer(),
                analysis.highlights()
        );
    }

    private String buildReason(QuoteAnalysis analysis) {
        StringBuilder sb = new StringBuilder("La IA detectó una solicitud de ")
                .append(analysis.experience());
        if (analysis.partySize() > 1) {
            sb.append(" para ").append(analysis.partySize()).append(" personas");
        }
        if (analysis.serviceDate() != null) {
            sb.append(" (fecha tentativa ").append(analysis.serviceDate()).append(")");
        }
        sb.append(".");
        return sb.toString();
    }

    private String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) {
            return primary;
        }
        return fallback;
    }
}
