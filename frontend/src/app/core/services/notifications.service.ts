import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { AppNotification } from '../models/notification.model';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly api = inject(ApiService);

  readonly notifications = signal<AppNotification[]>([]);
  readonly unreadCount = computed(() => this.notifications().filter((n) => !n.read).length);

  load(): Observable<AppNotification[]> {
    return this.api.get<AppNotification[]>('/notifications').pipe(
      catchError(() => of([])),
      tap((items) => this.notifications.set(items))
    );
  }

  markAsRead(id: string): void {
    this.notifications.update((items) => items.map((n) => (n.id === id ? { ...n, read: true } : n)));
    this.api
      .patch(`/notifications/${id}/read`, {})
      .pipe(catchError(() => of(null)))
      .subscribe();
  }

  markAllAsRead(): void {
    this.notifications.update((items) => items.map((n) => ({ ...n, read: true })));
    this.api
      .post<{ updated: number }>('/ops/notifications/mark-all-read', {})
      .pipe(catchError(() => of(null)))
      .subscribe();
  }
}
