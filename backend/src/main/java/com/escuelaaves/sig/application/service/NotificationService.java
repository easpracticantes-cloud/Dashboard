package com.escuelaaves.sig.application.service;

import com.escuelaaves.sig.application.dto.notification.NotificationDto;
import com.escuelaaves.sig.application.mapper.NotificationMapper;
import com.escuelaaves.sig.application.service.support.CurrentUserService;
import com.escuelaaves.sig.domain.port.in.NotificationUseCase;
import com.escuelaaves.sig.domain.port.out.NotificationRepositoryPort;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.NotificationEntity;
import com.escuelaaves.sig.infrastructure.adapter.out.persistence.entity.UserEntity;
import com.escuelaaves.sig.shared.exception.ResourceNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class NotificationService implements NotificationUseCase {

    private final NotificationRepositoryPort notificationRepositoryPort;
    private final NotificationMapper notificationMapper;
    private final CurrentUserService currentUserService;

    @Override
    public List<NotificationDto> listMyNotifications() {
        UserEntity user = currentUserService.getCurrentUser();
        return notificationRepositoryPort.findByUserIdOrderByCreatedAtDesc(user.getId()).stream()
                .map(notificationMapper::toDto)
                .toList();
    }

    @Override
    @Transactional
    public NotificationDto markAsRead(UUID id) {
        NotificationEntity notification = notificationRepositoryPort.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Notificacion no encontrada: " + id));
        notification.setRead(true);
        return notificationMapper.toDto(notificationRepositoryPort.save(notification));
    }
}
