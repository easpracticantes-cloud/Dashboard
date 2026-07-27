package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.common.PageResponse;
import com.escuelaaves.sig.application.dto.conversation.*;
import com.escuelaaves.sig.application.mapper.ConversationMapper;
import com.escuelaaves.sig.application.service.support.CurrentUserService;
import com.escuelaaves.sig.domain.model.ChannelType;
import com.escuelaaves.sig.domain.model.ConversationPriority;
import com.escuelaaves.sig.domain.model.MessageDirection;
import com.escuelaaves.sig.domain.model.MessageStatus;
import com.escuelaaves.sig.domain.model.SenderType;
import com.escuelaaves.sig.domain.port.in.ConversationUseCase;
import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.domain.port.out.ConversationRepositoryPort;
import com.escuelaaves.sig.domain.port.out.MessageRepositoryPort;
import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.domain.port.out.integration.WhatsAppPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ClientEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.MessageEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ConversationService implements ConversationUseCase {

    private static final int PREVIEW_MAX_LENGTH = 140;

    private final ConversationRepositoryPort conversationRepositoryPort;
    private final MessageRepositoryPort messageRepositoryPort;
    private final ClientRepositoryPort clientRepositoryPort;
    private final UserRepositoryPort userRepositoryPort;
    private final ConversationMapper conversationMapper;
    private final WhatsAppPort whatsAppPort;
    private final CurrentUserService currentUserService;

    @Override
    public PageResponse<ConversationDto> listConversations(Pageable pageable) {
        Page<ConversationDto> page = conversationRepositoryPort.findAll(pageable).map(conversationMapper::toDto);
        return PageResponse.of(page);
    }

    @Override
    public ConversationDto getConversation(UUID id) {
        return conversationMapper.toDto(findConversationOrThrow(id));
    }

    @Override
    @Transactional
    public ConversationDto createConversation(ConversationCreateRequest request) {
        ClientEntity client = clientRepositoryPort.findById(request.clientId())
                .orElseThrow(() -> new ResourceNotFoundException("Cliente no encontrado: " + request.clientId()));

        ConversationEntity conversation = ConversationEntity.builder()
                .client(client)
                .priority(request.priority() != null ? request.priority() : ConversationPriority.MEDIUM)
                .importance(request.importance() != null ? request.importance() : 3)
                .assignedUser(resolveUser(request.assignedUserId()))
                .labels(request.labels() != null ? new HashSet<>(request.labels()) : new HashSet<>())
                .channel(request.channel() != null ? request.channel() : ChannelType.WHATSAPP)
                .unreadCount(0)
                .build();

        conversation = conversationRepositoryPort.save(conversation);

        if (request.initialMessage() != null && !request.initialMessage().isBlank()) {
            appendMessage(conversation, request.initialMessage(), MessageDirection.INBOUND, SenderType.CLIENT, null);
            conversation = conversationRepositoryPort.save(conversation);
        }

        return conversationMapper.toDto(conversation);
    }

    @Override
    @Transactional
    public ConversationDto assignConversation(UUID id, ConversationAssignRequest request) {
        ConversationEntity conversation = findConversationOrThrow(id);
        conversation.setAssignedUser(resolveUser(request.assignedUserId()));
        return conversationMapper.toDto(conversationRepositoryPort.save(conversation));
    }

    @Override
    @Transactional
    public ConversationDto updateStatus(UUID id, ConversationStatusUpdateRequest request) {
        ConversationEntity conversation = findConversationOrThrow(id);
        conversation.setStatus(request.status());
        return conversationMapper.toDto(conversationRepositoryPort.save(conversation));
    }

    @Override
    @Transactional
    public ConversationDto updatePriority(UUID id, ConversationPriorityUpdateRequest request) {
        ConversationEntity conversation = findConversationOrThrow(id);
        conversation.setPriority(request.priority());
        return conversationMapper.toDto(conversationRepositoryPort.save(conversation));
    }

    @Override
    @Transactional
    public ConversationDto updateConversation(UUID id, ConversationUpdateRequest request) {
        ConversationEntity conversation = findConversationOrThrow(id);
        if (request.status() != null) conversation.setStatus(request.status());
        if (request.priority() != null) conversation.setPriority(request.priority());
        if (request.importance() != null) conversation.setImportance(request.importance());
        if (request.assignedUserId() != null) conversation.setAssignedUser(resolveUser(request.assignedUserId()));
        if (request.category() != null) conversation.setCategory(request.category());
        if (request.notes() != null) conversation.setNotes(request.notes());
        if (request.labels() != null) conversation.setLabels(new HashSet<>(request.labels()));
        return conversationMapper.toDto(conversationRepositoryPort.save(conversation));
    }

    @Override
    @Transactional
    public void deleteConversation(UUID id) {
        findConversationOrThrow(id);
        conversationRepositoryPort.deleteById(id);
    }

    @Override
    public List<MessageDto> listMessages(UUID conversationId) {
        findConversationOrThrow(conversationId);
        return messageRepositoryPort.findByConversationIdOrderBySentAtAsc(conversationId).stream()
                .map(conversationMapper::toDto)
                .toList();
    }

    @Override
    @Transactional
    public MessageDto addMessage(UUID conversationId, MessageCreateRequest request) {
        ConversationEntity conversation = findConversationOrThrow(conversationId);
        UserEntity agent = currentUserService.getCurrentUser();

        MessageEntity message = appendMessage(conversation, request.body(), MessageDirection.OUTBOUND, SenderType.AGENT, agent);
        conversationRepositoryPort.save(conversation);

        if (conversation.getClient().getPhone() != null) {
            whatsAppPort.sendMessage(conversation.getClient().getPhone(), request.body());
        }

        return conversationMapper.toDto(message);
    }

    private MessageEntity appendMessage(ConversationEntity conversation, String body, MessageDirection direction,
                                         SenderType senderType, UserEntity agent) {
        MessageEntity message = MessageEntity.builder()
                .conversation(conversation)
                .direction(direction)
                .body(body)
                .status(direction == MessageDirection.OUTBOUND ? MessageStatus.SENT : MessageStatus.DELIVERED)
                .sentAt(Instant.now())
                .senderType(senderType)
                .agentUser(agent)
                .build();
        message = messageRepositoryPort.save(message);

        conversation.setLastMessagePreview(truncate(body));
        conversation.setLastMessageAt(message.getSentAt());
        if (direction == MessageDirection.INBOUND) {
            conversation.setUnreadCount(conversation.getUnreadCount() + 1);
        } else {
            conversation.setUnreadCount(0);
        }

        return message;
    }

    private String truncate(String body) {
        if (body == null) {
            return null;
        }
        return body.length() > PREVIEW_MAX_LENGTH ? body.substring(0, PREVIEW_MAX_LENGTH) + "..." : body;
    }

    private ConversationEntity findConversationOrThrow(UUID id) {
        return conversationRepositoryPort.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Conversacion no encontrada: " + id));
    }

    private UserEntity resolveUser(UUID userId) {
        if (userId == null) {
            return null;
        }
        return userRepositoryPort.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + userId));
    }
}
