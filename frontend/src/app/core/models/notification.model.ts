export type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'MESSAGE' | 'SYSTEM';

/** Mirrors the backend `NotificationDto` record exactly. */
export interface NotificationDto {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  link?: string | null;
  createdAt: string;
}

export type AppNotification = NotificationDto;
