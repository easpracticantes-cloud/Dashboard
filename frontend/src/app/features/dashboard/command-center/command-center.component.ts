import { Component, computed, inject, signal, ViewEncapsulation, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { catchError, interval, of } from 'rxjs';
import { BusinessPulse, FunnelMetrics, OpsService } from '../../../core/services/ops.service';
import { ReservationDto } from '../../../core/services/commercial.service';
import { LiveSyncService } from '../../../core/services/live-sync.service';
import { EnterpriseAiService } from '../../../core/services/enterprise-ai.service';

@Component({
  selector: 'eas-command-center',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatProgressSpinnerModule, CurrencyPipe, DecimalPipe, DatePipe],
  templateUrl: './command-center.component.html',
  styleUrl: './command-center.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class CommandCenterComponent implements OnInit {
  private readonly ops = inject(OpsService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly ai = inject(EnterpriseAiService);
  private readonly destroyRef = inject(DestroyRef);
  private lastTick = -1;

  readonly loading = signal(true);
  readonly pulse = signal<BusinessPulse | null>(null);
  readonly funnel = signal<FunnelMetrics | null>(null);
  readonly agenda = signal<ReservationDto[]>([]);
  readonly conversionPct = signal(0);
  readonly responseLagHours = signal(0);

  readonly claudeLoading = signal(true);
  readonly claudeUnavailable = signal(false);
  readonly claudeProvider = signal('claude');
  readonly claudeStatus = signal('');
  readonly claudeBudgetUsd = signal(5);
  readonly claudeSpentUsd = signal(0);
  readonly claudeRemainingUsd = signal(5);
  readonly claudeCalls = signal(0);
  readonly claudeUpdated = signal<string | null>(null);

  readonly claudeRemainingPct = computed(() => {
    const budget = this.claudeBudgetUsd();
    if (budget <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(100, (this.claudeRemainingUsd() / budget) * 100));
  });

  readonly claudeLow = computed(() => this.claudeRemainingUsd() > 0 && this.claudeRemainingPct() <= 20);
  readonly claudeEmpty = computed(() => this.claudeRemainingUsd() <= 0);

  readonly claudeReady = computed(() => {
    const s = this.claudeStatus().toUpperCase();
    return s === 'READY' || s === 'OK' || s === 'ACTIVE';
  });

  readonly claudeStatusLabel = computed(() => {
    if (this.claudeUnavailable()) {
      return 'Sin datos';
    }
    const s = this.claudeStatus();
    return s ? s : '—';
  });

  readonly funnelSteps = computed(() => {
    const f = this.funnel();
    if (!f) {
      return [];
    }
    const max = Math.max(f.quotes, f.reservations, f.sales, 1);
    return [
      { key: 'Cotizaciones', value: f.quotes, pct: (f.quotes / max) * 100, route: '/app/registro' },
      { key: 'Reservas', value: f.reservations, pct: (f.reservations / max) * 100, route: '/app/registro' },
      { key: 'Ventas', value: f.sales, pct: (f.sales / max) * 100, route: '/app/registro' }
    ];
  });

  ngOnInit(): void {
    this.reload();
    this.reloadClaude(true);
    this.lastTick = this.liveSync.tick();
    interval(2000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const t = this.liveSync.tick();
        if (t !== this.lastTick) {
          this.lastTick = t;
          this.ops.invalidateCommandCenter();
          this.reload();
          this.reloadClaude(false);
        }
      });
    interval(15000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.reloadClaude(false));
  }

  reload(): void {
    this.loading.set(true);
    this.ops.loadCommandCenter().subscribe({
      next: (center) => {
        this.pulse.set(center.pulse);
        this.funnel.set(center.funnel);
        this.agenda.set(center.agenda);
        this.conversionPct.set(center.conversionPct);
        this.responseLagHours.set(center.responseLagHours);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  private reloadClaude(showLoading: boolean): void {
    if (showLoading) {
      this.claudeLoading.set(true);
    }
    this.ai.status().pipe(catchError(() => of(null))).subscribe({
      next: (status) => {
        if (!status) {
          this.claudeUnavailable.set(true);
          this.claudeLoading.set(false);
          return;
        }
        this.claudeUnavailable.set(false);
        this.claudeProvider.set(String(status.provider || status.activeType || 'claude'));
        this.claudeStatus.set(String(status.status || ''));
        const budget = Number(status.budgetUsd);
        const spent = Number(status.spentUsd);
        const remaining = Number(status.remainingUsd);
        this.claudeBudgetUsd.set(Number.isFinite(budget) && budget > 0 ? budget : 5);
        this.claudeSpentUsd.set(Number.isFinite(spent) && spent > 0 ? spent : 0);
        this.claudeRemainingUsd.set(
          Number.isFinite(remaining) ? Math.max(0, remaining) : Math.max(0, this.claudeBudgetUsd() - this.claudeSpentUsd())
        );
        this.claudeCalls.set(Number(status.callCount) || 0);
        this.claudeUpdated.set(status.lastUsageAt || null);
        this.claudeLoading.set(false);
      },
      error: () => {
        this.claudeUnavailable.set(true);
        this.claudeLoading.set(false);
      }
    });
  }
}
