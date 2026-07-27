package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.client.ClientCreateRequest;
import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.client.ClientUpdateRequest;
import com.escuelaaves.sig.application.dto.common.PageResponse;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface ClientUseCase {

    PageResponse<ClientDto> listClients(Pageable pageable);

    ClientDto getClient(UUID id);

    ClientDto createClient(ClientCreateRequest request);

    ClientDto updateClient(UUID id, ClientUpdateRequest request);

    void deleteClient(UUID id);
}
