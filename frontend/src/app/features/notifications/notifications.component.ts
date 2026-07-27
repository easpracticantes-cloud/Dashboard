import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { NotificationsService } from '../../core/services/notifications.service';
import { NotificationDto, NotificationType } from '../../core/models/notification.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';

const TYPE_VISUAL: Record<NotificationType, { icon: string; toneClass: string; label: string }> = {
  INFO: { icon: 'info', toneClass: 'is-info', label: 'Info' },
  SUCCESS: { icon: 'check_circle', toneClass: 'is-success', label: 'Éxito' },
  WARNING: { icon: 'warning', toneClass: 'is-warning', label: 'Alerta' },
  ERROR: { icon: 'error', toneClass: 'is-error', label: 'Error' },
  MESSAGE: { icon: 'chat', toneClass: 'is-message', label: 'Mensaje' },
  SYSTEM: { icon: 'settings_suggest', toneClass: 'is-system', label: 'Sistema' }
};

@Component({
  selector: 'eas-notifications',
  standalone: true,
  imports: [FormsModule, RouterLink, MatIconModule, PageHeaderComponent, EmptyStateComponent, TimeAgoPipe],
  templateUrl: './notifications.component.html',
  styleUrl: './notifications.component.scss'
})
export class NotificationsComponent {
  readonly notificationsService = inject(NotificationsService);

  readonly loading = signal(true);
  readonly refreshing = signal(false);
  readonly filter = signal<'ALL' | 'UNREAD'>('ALL');
  readonly typeFilter = signal<NotificationType | 'ALL'>('ALL');
  readonly search = signal('');

  readonly typeVisual = TYPE_VISUAL;
  readonly typeTabs: { key: NotificationType | 'ALL'; label: string }[] = [
    { key: 'ALL', label: 'Todos los tipos' },
    { key: 'MESSAGE', label: 'Mensaje' },
    { key: 'WARNING', label: 'Alerta' },
    { key: 'SUCCESS', label: 'Éxito' },
    { key: 'INFO', label: 'Info' },
    { key: 'SYSTEM', label: 'Sistema' },
    { key: 'ERROR', label: 'Error' }
  ];

  readonly filteredNotifications = computed(() => {
    let items = this.notificationsService.notifications();
    if (this.filter() === 'UNREAD') {
      items = items.filter((n) => !n.read);
    }
    if (this.typeFilter() !== 'ALL') {
      items = items.filter((n) => n.type === this.typeFilter());
    }
    const term = this.search().trim().toLowerCase();
    if (term) {
      items = items.filter(
        (n) =>
          n.title.toLowerCase().includes(term) ||
          (n.body || '').toLowerCase().includes(term)
      );
    }
    return items;
  });

  readonly counts = computed(() => {
    const all = this.notificationsService.notifications();
    return {
      total: all.length,
      unread: all.filter((n) => !n.read).length
    };
  });

  constructor() {
    this.notificationsService.load().subscribe(() => this.loading.set(false));
  }

  setFilter(value: 'ALL' | 'UNREAD'): void {
    this.filter.set(value);
  }

  setType(value: NotificationType | 'ALL'): void {
    this.typeFilter.set(value);
  }

  refresh(): void {
    this.refreshing.set(true);
    this.notificationsService.load().subscribe(() => this.refreshing.set(false));
  }

  markAsRead(id: string): void {
    this.notificationsService.markAsRead(id);
  }

  actionLabel(n: NotificationDto): string {
    const link = (n.link || '').toLowerCase();
    if (link.includes('conversation')) return 'Abrir chat';
    if (link.includes('quote')) return 'Ver cotización';
    if (link.includes('reservation')) return 'Ver reserva';
    if (link.includes('sale')) return 'Ver venta';
    if (link.includes('client')) return 'Ver cliente';
    return n.link ? 'Abrir' : 'Detalle';
  }
}
