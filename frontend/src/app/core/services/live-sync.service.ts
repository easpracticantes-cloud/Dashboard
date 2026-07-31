import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timer } from 'rxjs';
import { IntegrationsService } from './integrations.service';
import { SettingsService } from './settings.service';
import { DashboardService } from './dashboard.service';
import { OpsService } from './ops.service';
import { AnalyticsService } from './analytics.service';

/**
 * Refresco de UI desde PostgreSQL (vía API).
 * NO dispara sync de Google Sheets en la navegación: eso lo hace el backend (bootstrap + cron 5 min).
 * Solo el botón manual llama a POST /integrations/sheets/sync.
 */
@Injectable({ providedIn: 'root' })
export class LiveSyncService {
  private readonly integrations = inject(IntegrationsService);
  private readonly settings = inject(SettingsService);
  private readonly dashboard = inject(DashboardService);
  private readonly ops = inject(OpsService);
  private readonly analytics = inject(AnalyticsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tick = signal(0);
  readonly lastSyncAt = signal<string | null>(null);
  readonly syncing = signal(false);
  readonly pollSeconds = signal(120);
  private started = false;
  private pollSub?: Subscription;

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.settings.getSettings().subscribe((items) => {
      const poll = items.find((s) => s.key === 'integrations.googleSheets.pollSeconds')?.value;
      const seconds = Number(poll);
      if (!Number.isNaN(seconds) && seconds >= 10) {
        this.pollSeconds.set(seconds);
        this.restartPolling();
      }
    });

    this.restartPolling();
  }

  /** Dispara sync manual (botón del topbar) → Google Sheets solo aquí. */
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
    finish();
  }

  private restartPolling(): void {
    this.pollSub?.unsubscribe();
    const ms = Math.max(10, this.pollSeconds()) * 1000;
    // timer(ms, ms): sin tick inmediato con sync; solo refresco de UI desde DB.
    this.pollSub = timer(ms, ms)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh(false));
  }
}
