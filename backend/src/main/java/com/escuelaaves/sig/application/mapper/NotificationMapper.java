package com.escuelaaves.sig.application.mapper;

import com.escuelaaves.sig.application.dto.notification.NotificationDto;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.NotificationEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface NotificationMapper {

    @Mapping(target = "userId", source = "user.id")
    NotificationDto toDto(NotificationEntity entity);
}
