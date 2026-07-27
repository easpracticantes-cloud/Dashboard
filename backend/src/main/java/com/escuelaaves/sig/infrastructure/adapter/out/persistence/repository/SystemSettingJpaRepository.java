package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.port.out.SystemSettingRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.SystemSettingEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SystemSettingJpaRepository extends JpaRepository<SystemSettingEntity, Long>, SystemSettingRepositoryPort {

    @Override
    Optional<SystemSettingEntity> findBySettingKey(String key);

    @Override
    SystemSettingEntity save(SystemSettingEntity setting);
}
