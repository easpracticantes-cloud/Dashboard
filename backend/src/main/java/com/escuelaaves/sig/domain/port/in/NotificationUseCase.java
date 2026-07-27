package com.escuelaaves.sig.domain.port.in;

import com.escuelaaves.sig.application.dto.notification.NotificationDto;

import java.util.List;
import java.util.UUID;

public interface NotificationUseCase {

    List<NotificationDto> listMyNotifications();

    NotificationDto markAsRead(UUID id);
}
