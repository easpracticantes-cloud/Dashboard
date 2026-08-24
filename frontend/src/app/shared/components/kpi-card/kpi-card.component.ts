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
        padding: 1.25rem 1.3rem 1.25rem;
        background:
          radial-gradient(ellipse 80% 70% at 100% 0%, rgba(228, 160, 26, 0.14), transparent 55%),
          var(--eas-surface);
        border: 2px solid color-mix(in srgb, var(--eas-leaf) 22%, var(--eas-line-soft));
        border-radius: 22px;
        transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
        overflow: hidden;
      }

      .kpi:hover {
        border-color: #e4a01a;
        box-shadow: 0 22px 44px rgba(20, 38, 28, 0.16), 0 0 0 4px rgba(228, 160, 26, 0.18);
        transform: translateY(-6px);
      }

      .kpi::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 6px;
        border-radius: 22px 0 0 22px;
        background: linear-gradient(180deg, #f0bc48, #e4a01a, #1f7a4c);
      }

      .kpi::after {
        content: '';
        position: absolute;
        right: -20px;
        top: -24px;
        width: 110px;
        height: 110px;
        border-radius: 999px;
        background: radial-gradient(circle, rgba(228, 160, 26, 0.22), transparent 70%);
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
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--eas-muted);
        line-height: 1.3;
      }

      .kpi__icon {
        display: inline-grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 14px;
        background: linear-gradient(135deg, rgba(228, 160, 26, 0.28), rgba(31, 122, 76, 0.2));
        color: #1a3d2c;
        flex: none;
        box-shadow: 0 8px 16px rgba(31, 122, 76, 0.18);
      }

      .kpi__icon mat-icon {
        font-size: 24px !important;
        width: 24px !important;
        height: 24px !important;
      }

      .kpi__value {
        margin: 0.75rem 0 0;
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-weight: 900;
        font-size: clamp(2.3rem, 3.5vw, 2.9rem);
        line-height: 1;
        letter-spacing: -0.045em;
        font-variant-numeric: tabular-nums;
        background: linear-gradient(135deg, #14261c, #1f7a4c);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      .kpi__icon[data-accent='amber'] {
        background: linear-gradient(135deg, rgba(228, 160, 26, 0.4), rgba(201, 132, 14, 0.25));
        color: var(--eas-amber-deep);
      }

      .kpi__icon[data-accent='danger'] {
        background: rgba(194, 81, 69, 0.18);
        color: var(--eas-danger);
      }

      .kpi__suffix {
        font-family: 'Sora', sans-serif;
        font-size: 0.75rem;
        color: var(--eas-muted);
        margin-left: 0.15rem;
        -webkit-text-fill-color: var(--eas-muted);
      }

      .kpi__delta {
        display: inline-flex;
        align-items: center;
        gap: 0.2rem;
        margin: 0.75rem 0 0;
        font-size: 0.72rem;
        font-weight: 700;
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
