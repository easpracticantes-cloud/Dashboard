package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.common.PageResponse;
import com.escuelaaves.sig.application.dto.conversation.*;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.UUID;

public interface ConversationUseCase {

    PageResponse<ConversationDto> listConversations(Pageable pageable);

    ConversationDto getConversation(UUID id);

    ConversationDto createConversation(ConversationCreateRequest request);

    ConversationDto assignConversation(UUID id, ConversationAssignRequest request);

    ConversationDto updateStatus(UUID id, ConversationStatusUpdateRequest request);

    ConversationDto updatePriority(UUID id, ConversationPriorityUpdateRequest request);

    ConversationDto updateConversation(UUID id, ConversationUpdateRequest request);

    void deleteConversation(UUID id);

    List<MessageDto> listMessages(UUID conversationId);

    MessageDto addMessage(UUID conversationId, MessageCreateRequest request);
}
