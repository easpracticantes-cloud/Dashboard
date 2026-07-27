import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { KpiItem } from '../../../core/models/kpi.model';

@Component({
  selector: 'eas-kpi-card',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <article class="kpi">
      <div class="kpi__top">
        <p class="kpi__label">{{ kpi().label }}</p>
        @if (kpi().icon) {
          <span class="kpi__icon" [attr.data-accent]="kpi().accent ?? 'forest'">
            <mat-icon>{{ kpi().icon }}</mat-icon>
          </span>
        }
      </div>
      <p class="kpi__value">
        {{ kpi().value }}<span class="kpi__suffix">{{ kpi().suffix }}</span>
      </p>
      @if (kpi().delta !== undefined && kpi().delta !== null) {
        <p class="kpi__delta" [attr.data-trend]="kpi().trend ?? 'flat'">
          <mat-icon>{{ trendIcon() }}</mat-icon>
          {{ kpi().delta! > 0 ? '+' : '' }}{{ kpi().delta }}%
          <span>vs. semana anterior</span>
        </p>
      }
    </article>
  `,
  styles: [
    `
      .kpi {
        position: relative;
        padding: 1.15rem 1.2rem 1.15rem;
        background: var(--eas-surface);
        border: 1px solid var(--eas-line-soft);
        border-radius: 18px;
        transition: border-color 0.2s ease, box-shadow 0.2s ease;
        overflow: hidden;
      }

      .kpi:hover {
        border-color: color-mix(in srgb, var(--eas-leaf) 22%, var(--eas-line-soft));
        box-shadow: var(--eas-shadow-sm);
      }

      .kpi::before {
        content: '';
        position: absolute;
        left: 0;
        top: 12px;
        bottom: 12px;
        width: 3px;
        border-radius: 999px;
        background: linear-gradient(180deg, var(--eas-amber), var(--eas-leaf));
        opacity: 0.95;
      }

      .kpi::after {
        content: '';
        position: absolute;
        right: -20px;
        top: -24px;
        width: 80px;
        height: 80px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(31, 122, 76, 0.08), transparent 70%);
        pointer-events: none;
      }

      .kpi__top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.5rem;
      }

      .kpi__label {
        margin: 0;
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        color: var(--eas-muted);
        line-height: 1.3;
      }

      .kpi__icon {
        display: inline-grid;
        place-items: center;
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: var(--eas-mist);
        color: var(--eas-leaf);
        flex: none;
      }

      .kpi__icon mat-icon {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
      }

      .kpi__value {
        margin: 0.7rem 0 0;
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-weight: 800;
        font-size: 2.15rem;
        line-height: 1;
        letter-spacing: -0.04em;
        font-variant-numeric: tabular-nums;
        color: var(--eas-ink);
      }

      .kpi__icon[data-accent='amber'] {
        background: rgba(228, 160, 26, 0.16);
        color: var(--eas-amber-deep);
      }

      .kpi__icon[data-accent='danger'] {
        background: rgba(194, 81, 69, 0.14);
        color: var(--eas-danger);
      }

      .kpi__suffix {
        font-family: 'Sora', sans-serif;
        font-size: 0.75rem;
        color: var(--eas-muted);
        margin-left: 0.15rem;
      }

      .kpi__delta {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        margin: 0.7rem 0 0;
        font-size: 0.6875rem;
        font-weight: 600;
        color: var(--eas-muted);
      }

      .kpi__delta[data-trend='up'] {
        color: var(--eas-leaf);
      }

      .kpi__delta[data-trend='down'] {
        color: var(--eas-danger);
      }

      .kpi__delta span {
        font-weight: 400;
        color: var(--eas-muted);
        margin-left: 0.15rem;
      }

      .kpi__delta mat-icon {
        font-size: 14px !important;
        width: 14px !important;
        height: 14px !important;
      }
    `
  ]
})
export class KpiCardComponent {
  readonly kpi = input.required<KpiItem>();

  readonly trendIcon = computed(() => {
    const trend = this.kpi().trend;
    if (trend === 'up') return 'trending_up';
    if (trend === 'down') return 'trending_down';
    return 'trending_flat';
  });
}
