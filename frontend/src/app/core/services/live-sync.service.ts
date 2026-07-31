import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timer } from 'rxjs';
import { IntegrationsService } from './integrations.service';
import { DashboardService } from './dashboard.service';
import { OpsService } from './ops.service';
import { AnalyticsService } from './analytics.service';
import { SettingsService } from './settings.service';

/**
 * Refresco de UI desde PostgreSQL.
 * Google Sheets solo vía sync manual / cron backend.
 */
@Injectable({ providedIn: 'root' })
export class LiveSyncService {
  private readonly integrations = inject(IntegrationsService);
  private readonly dashboard = inject(DashboardService);
  private readonly ops = inject(OpsService);
  private readonly analytics = inject(AnalyticsService);
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tick = signal(0);
  readonly lastSyncAt = signal<string | null>(null);
  readonly syncing = signal(false);
  /** Poll UI cada 3 min (backend cron Sheets = 5 min). */
  readonly pollSeconds = signal(180);
  private started = false;
  private pollSub?: Subscription;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.restartPolling();
  }

  syncNow(): void {
    this.refresh(true);
  }

  refresh(forceSync = false): void {
    this.syncing.set(true);
    const finish = () => {
      this.dashboard.invalidateCache();
      this.settings.invalidateCache();
      this.ops.invalidateCommandCenter();
      this.analytics.invalidateCache();
      this.syncing.set(false);
      this.lastSyncAt.set(new Date().toISOString());
      this.tick.update((n) => n + 1);
    };

    if (forceSync) {
      this.integrations.syncSheets().subscribe({ next: () => finish(), error: () => finish() });
      return;
    }
    // Soft poll: invalida caches FE y pide datos frescos de PostgreSQL (sin Google)
    finish();
  }

  private restartPolling(): void {
    this.pollSub?.unsubscribe();
    const ms = Math.max(30, this.pollSeconds()) * 1000;
    this.pollSub = timer(ms, ms)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh(false));
  }
}
