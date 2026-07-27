package com.escuelaaves.sig.application.mapper;

import com.escuelaaves.sig.application.dto.conversation.ConversationDto;
import com.escuelaaves.sig.application.dto.conversation.MessageDto;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ConversationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.MessageEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ConversationMapper {

    @Mapping(target = "clientId", source = "client.id")
    @Mapping(target = "clientName", source = "client.name")
    @Mapping(target = "clientAvatarUrl", source = "client.avatarUrl")
    @Mapping(target = "clientPhone", source = "client.phone")
    @Mapping(target = "assignedUserId", source = "assignedUser.id")
    @Mapping(target = "assignedUserName", source = "assignedUser.fullName")
    ConversationDto toDto(ConversationEntity entity);

    @Mapping(target = "conversationId", source = "conversation.id")
    @Mapping(target = "agentUserId", source = "agentUser.id")
    @Mapping(target = "agentUserName", source = "agentUser.fullName")
    MessageDto toDto(MessageEntity entity);
}
