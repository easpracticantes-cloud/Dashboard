import { Component, computed, inject, signal, ViewEncapsulation, OnInit, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { interval } from 'rxjs';
import { BusinessPulse, FunnelMetrics, OpsService } from '../../../core/services/ops.service';
import { ReservationDto } from '../../../core/services/commercial.service';
import { LiveSyncService } from '../../../core/services/live-sync.service';

@Component({
  selector: 'eas-command-center',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatProgressSpinnerModule, CurrencyPipe, DecimalPipe],
  templateUrl: './command-center.component.html',
  styleUrl: './command-center.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class CommandCenterComponent implements OnInit {
  private readonly ops = inject(OpsService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly destroyRef = inject(DestroyRef);
  private lastTick = -1;

  readonly loading = signal(true);
  readonly pulse = signal<BusinessPulse | null>(null);
  readonly funnel = signal<FunnelMetrics | null>(null);
  readonly agenda = signal<ReservationDto[]>([]);
  readonly conversionPct = signal(0);
  readonly responseLagHours = signal(0);

  readonly funnelSteps = computed(() => {
    const f = this.funnel();
    if (!f) {
      return [];
    }
    const max = Math.max(f.quotes, f.reservations, f.sales, 1);
    return [
      { key: 'Cotizaciones', value: f.quotes, pct: (f.quotes / max) * 100, route: '/app/quotes' },
      { key: 'Reservas', value: f.reservations, pct: (f.reservations / max) * 100, route: '/app/reservations' },
      { key: 'Ventas', value: f.sales, pct: (f.sales / max) * 100, route: '/app/sales' }
    ];
  });

  ngOnInit(): void {
    this.reload();
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
}
