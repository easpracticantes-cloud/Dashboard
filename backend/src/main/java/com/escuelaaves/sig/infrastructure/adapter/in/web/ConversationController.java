package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.common.PageResponse;
import com.escuelaaves.sig.application.dto.conversation.*;
import com.escuelaaves.sig.domain.port.in.ConversationUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/conversations")
@RequiredArgsConstructor
@Tag(name = "Conversaciones", description = "Bandeja de conversaciones tipo WhatsApp con clientes")
public class ConversationController {

    private final ConversationUseCase conversationUseCase;

    @GetMapping
    @Operation(summary = "Lista conversaciones de forma paginada")
    public ResponseEntity<PageResponse<ConversationDto>> list(Pageable pageable) {
        return ResponseEntity.ok(conversationUseCase.listConversations(pageable));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Obtiene una conversacion por id")
    public ResponseEntity<ConversationDto> get(@PathVariable UUID id) {
        return ResponseEntity.ok(conversationUseCase.getConversation(id));
    }

    @PostMapping
    @Operation(summary = "Crea una nueva conversacion para un cliente")
    public ResponseEntity<ConversationDto> create(@Valid @RequestBody ConversationCreateRequest request) {
        return ResponseEntity.status(201).body(conversationUseCase.createConversation(request));
    }

    @PatchMapping("/{id}/assign")
    @Operation(summary = "Asigna la conversacion a un usuario")
    public ResponseEntity<ConversationDto> assign(@PathVariable UUID id, @Valid @RequestBody ConversationAssignRequest request) {
        return ResponseEntity.ok(conversationUseCase.assignConversation(id, request));
    }

    @PatchMapping("/{id}/status")
    @Operation(summary = "Actualiza el estado de la conversacion")
    public ResponseEntity<ConversationDto> updateStatus(@PathVariable UUID id, @Valid @RequestBody ConversationStatusUpdateRequest request) {
        return ResponseEntity.ok(conversationUseCase.updateStatus(id, request));
    }

    @PatchMapping("/{id}/priority")
    @Operation(summary = "Actualiza la prioridad de la conversacion")
    public ResponseEntity<ConversationDto> updatePriority(@PathVariable UUID id, @Valid @RequestBody ConversationPriorityUpdateRequest request) {
        return ResponseEntity.ok(conversationUseCase.updatePriority(id, request));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Actualiza campos operativos de la conversacion")
    public ResponseEntity<ConversationDto> update(@PathVariable UUID id, @Valid @RequestBody ConversationUpdateRequest request) {
        return ResponseEntity.ok(conversationUseCase.updateConversation(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Elimina una conversacion")
    public ResponseEntity<Void> delete(@PathVariable UUID id) {
        conversationUseCase.deleteConversation(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}/messages")
    @Operation(summary = "Lista los mensajes de una conversacion")
    public ResponseEntity<List<MessageDto>> listMessages(@PathVariable UUID id) {
        return ResponseEntity.ok(conversationUseCase.listMessages(id));
    }

    @PostMapping("/{id}/messages")
    @Operation(summary = "Envia un nuevo mensaje en la conversacion")
    public ResponseEntity<MessageDto> addMessage(@PathVariable UUID id, @Valid @RequestBody MessageCreateRequest request) {
        return ResponseEntity.status(201).body(conversationUseCase.addMessage(id, request));
    }
}
