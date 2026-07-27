package com.escuelaaves.sig.application.mapper;

import com.escuelaaves.sig.application.dto.setting.SettingDto;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SystemSettingEntity;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;

@Mapper(componentModel = "spring")
public interface SettingMapper {

    @Mapping(target = "key", source = "settingKey")
    @Mapping(target = "value", source = "settingValue")
    SettingDto toDto(SystemSettingEntity entity);
}
