package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.ConversationSummary;
import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.ReplySuggestion;
import com.escuelaaves.sig.application.dto.ai.AiAssistDtos.SentimentInsight;
import com.escuelaaves.sig.domain.model.ChatQuoteContext;
import com.escuelaaves.sig.domain.model.ChatQuoteContext.ChatTurn;
import com.escuelaaves.sig.domain.model.ChatSentiment;
import com.escuelaaves.sig.domain.model.ChatSummary;
import com.escuelaaves.sig.domain.model.IntegrationStatus;
import com.escuelaaves.sig.domain.model.SenderType;
import com.escuelaaves.sig.domain.port.in.AiAssistUseCase;
import com.escuelaaves.sig.domain.port.out.ConversationRepositoryPort;
import com.escuelaaves.sig.domain.port.out.MessageRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.ChatAssistPort;
import com.escuelaaves.sig.domain.port.out.integration.ClaudeAiPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.MessageEntity;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class AiAssistService implements AiAssistUseCase {

    private final ConversationRepositoryPort conversationRepositoryPort;
    private final MessageRepositoryPort messageRepositoryPort;
    private final ChatAssistPort chatAssistPort;
    private final ClaudeAiPort claudeAiPort;

    @Override
    public ReplySuggestion suggestReply(UUID conversationId) {
        String reply = chatAssistPort.suggestReply(context(conversationId));
        return new ReplySuggestion(reply, analyzer());
    }

    @Override
    public ConversationSummary summarize(UUID conversationId) {
        ChatSummary summary = chatAssistPort.summarize(context(conversationId));
        return new ConversationSummary(summary.summary(), summary.keyPoints(), summary.nextStep(), summary.analyzer());
    }

    @Override
    public SentimentInsight analyzeSentiment(UUID conversationId) {
        ChatSentiment s = chatAssistPort.analyzeSentiment(context(conversationId));
        return new SentimentInsight(s.sentiment(), s.intent(), s.urgency(), s.score(), s.signals());
    }

    private ChatQuoteContext context(UUID conversationId) {
        ConversationEntity conversation = conversationRepositoryPort.findById(conversationId)
                .orElseThrow(() -> new ResourceNotFoundException("Conversación no encontrada"));
        List<MessageEntity> messages = messageRepositoryPort.findByConversationIdOrderBySentAtAsc(conversationId);

        List<ChatTurn> turns = new ArrayList<>();
        for (MessageEntity m : messages) {
            if (m.getBody() == null || m.getBody().isBlank()) {
                continue;
            }
            turns.add(new ChatTurn(m.getSenderType() == SenderType.CLIENT, m.getBody()));
        }
        String clientName = conversation.getClient() != null ? conversation.getClient().getName() : null;
        String phone = conversation.getClient() != null ? conversation.getClient().getPhone() : null;
        return new ChatQuoteContext(clientName, phone, turns);
    }

    private String analyzer() {
        return claudeAiPort.status() == IntegrationStatus.CONNECTED ? "CLAUDE_AI" : "HEURISTICA";
    }
}
