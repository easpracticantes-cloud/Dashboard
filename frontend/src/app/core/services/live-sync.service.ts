import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subscription, timer } from 'rxjs';
import { IntegrationsService } from './integrations.service';
import { SettingsService } from './settings.service';

/**
 * Dispara refrescos periodicos del CRM (Sheets → backend → UI)
 * sin recargar la pagina.
 */
@Injectable({ providedIn: 'root' })
export class LiveSyncService {
  private readonly integrations = inject(IntegrationsService);
  private readonly settings = inject(SettingsService);
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

  /** Dispara sync manual (botón del topbar). */
  syncNow(): void {
    this.refresh(true);
  }

  refresh(forceSync = false): void {
    this.syncing.set(true);
    const finish = () => {
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
    this.pollSub = timer(0, ms)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.refresh(true));
  }
}
