package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SystemSettingEntity;

import java.util.List;
import java.util.Optional;

public interface SystemSettingRepositoryPort {

    List<SystemSettingEntity> findAll();

    Optional<SystemSettingEntity> findBySettingKey(String key);

    SystemSettingEntity save(SystemSettingEntity setting);
}
