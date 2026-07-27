package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.setting.SettingDto;
import com.escuelaaves.sig.application.dto.setting.SettingUpdateRequest;
import com.escuelaaves.sig.application.mapper.SettingMapper;
import com.escuelaaves.sig.domain.model.SettingCategory;
import com.escuelaaves.sig.domain.port.in.SettingsUseCase;
import com.escuelaaves.sig.domain.port.out.SystemSettingRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SystemSettingEntity;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SettingsService implements SettingsUseCase {

    private final SystemSettingRepositoryPort systemSettingRepositoryPort;
    private final SettingMapper settingMapper;

    @Override
    public List<SettingDto> getSettings() {
        return systemSettingRepositoryPort.findAll().stream().map(settingMapper::toDto).toList();
    }

    @Override
    @Transactional
    public List<SettingDto> updateSettings(SettingUpdateRequest request) {
        request.settings().forEach(item -> {
            SystemSettingEntity setting = systemSettingRepositoryPort.findBySettingKey(item.key())
                    .orElseGet(() -> SystemSettingEntity.builder()
                            .settingKey(item.key())
                            .category(SettingCategory.GENERAL)
                            .build());
            setting.setSettingValue(item.value());
            systemSettingRepositoryPort.save(setting);
        });
        return getSettings();
    }
}
