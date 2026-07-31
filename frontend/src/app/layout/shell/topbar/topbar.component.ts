import { Component, EventEmitter, Output, computed, inject, OnInit, ViewEncapsulation } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { DatePipe } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { NotificationsService } from '../../../core/services/notifications.service';
import { ThemeService } from '../../../core/services/theme.service';
import { LiveSyncService } from '../../../core/services/live-sync.service';
import { ROLE_LABELS } from '../../../core/models/role.model';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { NotificationDto } from '../../../core/models/notification.model';

@Component({
  selector: 'eas-topbar',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatMenuModule, MatBadgeModule, AvatarComponent, TimeAgoPipe, DatePipe],
  templateUrl: './topbar.component.html',
  styleUrl: './topbar.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class TopbarComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly notifications = inject(NotificationsService);
  readonly theme = inject(ThemeService);
  readonly liveSync = inject(LiveSyncService);

  @Output() menuToggle = new EventEmitter<void>();
  @Output() openCommand = new EventEmitter<void>();

  searchTerm = '';

  readonly user = computed(() => this.auth.currentUser());
  readonly roleLabel = computed(() => {
    const rol = this.user()?.rol;
    return rol ? ROLE_LABELS[rol] : '';
  });
  readonly unread = computed(() => this.notifications.unreadCount());
  readonly syncLabel = computed(() => {
    if (this.liveSync.syncing()) {
      return 'Sincronizando…';
    }
    const at = this.liveSync.lastSyncAt();
    return at ? 'Sheets al día' : 'Sincronizar';
  });

  ngOnInit(): void {
    // Diferir notificaciones: no competir con command-center / sheets summary
    const run = () => this.notifications.load().subscribe();
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => run(), { timeout: 2500 });
    } else {
      setTimeout(run, 1200);
    }
  }

  syncNow(): void {
    this.liveSync.syncNow();
  }

  onSearchFocus(): void {
    this.openCommand.emit();
  }

  onSearch(): void {
    this.openCommand.emit();
  }

  actionLabel(n: NotificationDto): string {
    const link = (n.link || '').toLowerCase();
    if (link.includes('conversation')) return 'Abrir chat';
    if (link.includes('quote')) return 'Ver cotización';
    if (link.includes('reservation')) return 'Ver reserva';
    if (link.includes('sale')) return 'Ver venta';
    if (link.includes('client')) return 'Ver cliente';
    return n.link ? 'Abrir' : 'Ver aviso';
  }

  openNotification(n: NotificationDto, event: Event): void {
    event.stopPropagation();
    if (!n.read) {
      this.notifications.markAsRead(n.id);
    }
    void this.router.navigateByUrl(n.link || '/app/notifications');
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  logout(): void {
    this.auth.logout();
  }
}
