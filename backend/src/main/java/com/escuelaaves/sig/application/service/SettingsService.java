package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.setting.SettingDto;
import com.escuelaaves.sig.application.dto.setting.SettingUpdateRequest;
import com.escuelaaves.sig.application.mapper.SettingMapper;
import com.escuelaaves.sig.domain.model.SettingCategory;
import com.escuelaaves.sig.domain.port.in.SettingsUseCase;
import com.escuelaaves.sig.domain.port.out.SystemSettingRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SystemSettingEntity;
import com.escuelaaves.sig.infrastructure.cache.TtlCacheService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SettingsService implements SettingsUseCase {

    private static final String CACHE_KEY = "settings:all";

    private final SystemSettingRepositoryPort systemSettingRepositoryPort;
    private final SettingMapper settingMapper;
    private final TtlCacheService ttlCacheService;

    @Override
    public List<SettingDto> getSettings() {
        return ttlCacheService.getOrLoad(CACHE_KEY, () -> {
            long t0 = System.nanoTime();
            List<SettingDto> list = systemSettingRepositoryPort.findAll().stream()
                    .map(settingMapper::toDto)
                    .toList();
            log.info("[SQL-TIMING] settings.findAll ms={} rows={}", (System.nanoTime() - t0) / 1_000_000, list.size());
            return list;
        });
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
        ttlCacheService.invalidate(CACHE_KEY);
        return getSettings();
    }
}
