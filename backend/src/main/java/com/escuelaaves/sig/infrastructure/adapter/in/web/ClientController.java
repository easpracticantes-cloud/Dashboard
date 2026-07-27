package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.client.ClientCreateRequest;
import com.escuelaaves.sig.application.dto.client.ClientDto;
import com.escuelaaves.sig.application.dto.client.ClientUpdateRequest;
import com.escuelaaves.sig.application.dto.common.PageResponse;
import com.escuelaaves.sig.domain.port.in.ClientUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/clients")
@RequiredArgsConstructor
@Tag(name = "Clientes", description = "Gestion del CRM de clientes")
public class ClientController {

    private final ClientUseCase clientUseCase;

    @GetMapping
    @Operation(summary = "Lista clientes de forma paginada")
    public ResponseEntity<PageResponse<ClientDto>> list(Pageable pageable) {
        return ResponseEntity.ok(clientUseCase.listClients(pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtiene un cliente por id")
    public ResponseEntity<ClientDto> get(@PathVariable UUID id) {
        return ResponseEntity.ok(clientUseCase.getClient(id));
    }

    @PostMapping
    @Operation(summary = "Crea un nuevo cliente")
    public ResponseEntity<ClientDto> create(@Valid @RequestBody ClientCreateRequest request) {
        return ResponseEntity.status(201).body(clientUseCase.createClient(request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualiza un cliente existente")
    public ResponseEntity<ClientDto> update(@PathVariable UUID id, @RequestBody ClientUpdateRequest request) {
        return ResponseEntity.ok(clientUseCase.updateClient(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Elimina un cliente")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        clientUseCase.deleteClient(id);
        return ResponseEntity.noContent().build();
    }
}
