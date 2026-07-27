package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.client.ClientCreateRequest;
import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.client.ClientUpdateRequest;
import com.escuelaaves.sig.application.dto.common.PageResponse;
import com.escuelaaves.sig.application.mapper.ClientMapper;
import com.escuelaaves.sig.domain.port.in.ClientUseCase;
import com.escuelaaves.sig.domain.port.out.ClientRepositoryPort;
import com.escuelaaves.sig.domain.port.out.UserRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.ClientEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashSet;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ClientService implements ClientUseCase {

    private final ClientRepositoryPort clientRepositoryPort;
    private final UserRepositoryPort userRepositoryPort;
    private final ClientMapper clientMapper;

    @Override
    public PageResponse<ClientDto> listClients(Pageable pageable) {
        Page<ClientDto> page = clientRepositoryPort.findAll(pageable).map(clientMapper::toDto);
        return PageResponse.of(page);
    }

    @Override
    public ClientDto getClient(UUID id) {
        return clientMapper.toDto(findClientOrThrow(id));
    }

    @Override
    @Transactional
    public ClientDto createClient(ClientCreateRequest request) {
        ClientEntity client = ClientEntity.builder()
                .name(request.name())
                .phone(request.phone())
                .email(request.email())
                .avatarUrl(request.avatarUrl())
                .segment(request.segment())
                .source(request.source())
                .notes(request.notes())
                .tags(request.tags() != null ? new HashSet<>(request.tags()) : new HashSet<>())
                .assignedUser(resolveAssignedUser(request.assignedUserId()))
                .lastContactAt(Instant.now())
                .build();

        return clientMapper.toDto(clientRepositoryPort.save(client));
    }

    @Override
    @Transactional
    public ClientDto updateClient(UUID id, ClientUpdateRequest request) {
        ClientEntity client = findClientOrThrow(id);

        if (request.name() != null) {
            client.setName(request.name());
        }
        if (request.phone() != null) {
            client.setPhone(request.phone());
        }
        if (request.email() != null) {
            client.setEmail(request.email());
        }
        if (request.avatarUrl() != null) {
            client.setAvatarUrl(request.avatarUrl());
        }
        if (request.segment() != null) {
            client.setSegment(request.segment());
        }
        if (request.source() != null) {
            client.setSource(request.source());
        }
        if (request.notes() != null) {
            client.setNotes(request.notes());
        }
        if (request.tags() != null) {
            client.setTags(new HashSet<>(request.tags()));
        }
        if (request.assignedUserId() != null) {
            client.setAssignedUser(resolveAssignedUser(request.assignedUserId()));
        }

        return clientMapper.toDto(clientRepositoryPort.save(client));
    }

    @Override
    @Transactional
    public void deleteClient(UUID id) {
        findClientOrThrow(id);
        clientRepositoryPort.deleteById(id);
    }

    private ClientEntity findClientOrThrow(UUID id) {
        return clientRepositoryPort.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Cliente no encontrado: " + id));
    }

    private UserEntity resolveAssignedUser(UUID userId) {
        if (userId == null) {
            return null;
        }
        return userRepositoryPort.findById(userId)
                .orElseThrow(() -> new ResourceNotFoundException("Usuario asignado no encontrado: " + userId));
    }
}
