package com.escuelaaves.sig.infrastructure.adapter.in.web;

import com.escuelaaves.sig.application.dto.notification.NotificationDto;
import com.escuelaaves.sig.domain.port.in.NotificationUseCase;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/notifications")
@RequiredArgsConstructor
@Tag(name = "Notificaciones", description = "Notificaciones internas del usuario autenticado")
public class NotificationController {

    private final NotificationUseCase notificationUseCase;

    @GetMapping
    @Operation(summary = "Lista las notificaciones del usuario autenticado")
    public ResponseEntity<List<NotificationDto>> list() {
        return ResponseEntity.ok(notificationUseCase.listMyNotifications());
    }

    @PatchMapping("/{id}/read")
    @Operation(summary = "Marca una notificacion como leida")
    public ResponseEntity<NotificationDto> markRead(@PathVariable UUID id) {
        return ResponseEntity.ok(notificationUseCase.markAsRead(id));
    }
}
