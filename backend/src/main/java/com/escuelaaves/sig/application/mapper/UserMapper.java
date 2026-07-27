package com.escuelaaves.sig.application.mapper;

import com.escuelaaves.sig.application.dto.user.UserDto;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface UserMapper {

    @Mapping(target = "role", source = "role.name")
    UserDto toDto(UserEntity entity);
}
