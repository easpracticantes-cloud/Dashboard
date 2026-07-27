package com.escuelaaves.sig.application.mapper;

import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ClientEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface ClientMapper {

    @Mapping(target = "assignedUserId", source = "assignedUser.id")
    @Mapping(target = "assignedUserName", source = "assignedUser.fullName")
    ClientDto toDto(ClientEntity entity);
}
