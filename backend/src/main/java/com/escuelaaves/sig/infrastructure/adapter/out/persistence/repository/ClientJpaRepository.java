package com.escuelaaves.sig.infrastructure.adapter.out.persistence.repository;

import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ClientEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface ClientJpaRepository extends JpaRepository<ClientEntity, UUID>, ClientRepositoryPort {

    @Override
    Optional<ClientEntity> findByPhone(String phone);

    @Override
    Optional<ClientEntity> findFirstByPhone(String phone);

    @Override
    ClientEntity save(ClientEntity client);
}
