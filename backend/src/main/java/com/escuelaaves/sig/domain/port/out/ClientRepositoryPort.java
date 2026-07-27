package com.escuelaaves.sig.domain.port.out;

import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ClientEntity;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ClientRepositoryPort {

    Optional<ClientEntity> findById(UUID id);

    Optional<ClientEntity> findByPhone(String phone);

    Optional<ClientEntity> findFirstByPhone(String phone);

    Page<ClientEntity> findAll(Pageable pageable);

    List<ClientEntity> findAll();

    ClientEntity save(ClientEntity client);

    void deleteById(UUID id);

    long count();
}
