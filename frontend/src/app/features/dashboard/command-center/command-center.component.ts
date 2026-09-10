import { Component, computed, inject, signal, ViewEncapsulation, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { catchError, forkJoin, interval, of } from 'rxjs';
import { BusinessPulse, FunnelMetrics, OpsService } from '../../../core/services/ops.service';
import { ReservationDto } from '../../../core/services/commercial.service';
import { LiveSyncService } from '../../../core/services/live-sync.service';
import { EnterpriseAiService, UsageLog } from '../../../core/services/enterprise-ai.service';

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
  readonly claudeSpentUsd = signal<number | null>(null);
  readonly claudeCalls = signal(0);
  readonly claudeUpdated = signal<string | null>(null);

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
    this.reloadClaude();
    this.lastTick = this.liveSync.tick();
    interval(2000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const t = this.liveSync.tick();
        if (t !== this.lastTick) {
          this.lastTick = t;
          this.ops.invalidateCommandCenter();
          this.reload();
        }
      });
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

  private reloadClaude(): void {
    this.claudeLoading.set(true);
    forkJoin({
      status: this.ai.status().pipe(catchError(() => of(null))),
      logs: this.ai.usageLogs().pipe(catchError(() => of(null as UsageLog[] | null)))
    }).subscribe({
      next: ({ status, logs }) => {
        if (status) {
          this.claudeProvider.set(String(status['provider'] || status['activeType'] || 'claude'));
          this.claudeStatus.set(String(status['status'] || ''));
        }
        if (!logs) {
          this.claudeUnavailable.set(true);
          this.claudeSpentUsd.set(null);
          this.claudeCalls.set(0);
          this.claudeUpdated.set(null);
        } else {
          const claudeLogs = logs.filter((u) => {
            const p = (u.provider || '').toLowerCase();
            return p === 'claude' || p === 'anthropic';
          });
          this.claudeUnavailable.set(false);
          this.claudeCalls.set(claudeLogs.length);
          const spent = claudeLogs.reduce((sum, u) => sum + (Number(u.estimatedCostUsd) || 0), 0);
          this.claudeSpentUsd.set(spent);
          const latest = claudeLogs.find((u) => !!u.createdAt)?.createdAt ?? logs[0]?.createdAt ?? null;
          this.claudeUpdated.set(latest);
        }
        this.claudeLoading.set(false);
      },
      error: () => {
        this.claudeUnavailable.set(true);
        this.claudeLoading.set(false);
      }
    });
  }
}
