import { Component, input } from '@angular/core';

@Component({
  selector: 'eas-page-header',
  standalone: true,
  template: `
    <header class="ph">
      <div class="ph__glow" aria-hidden="true"></div>
      <div class="ph__copy">
        @if (eyebrow()) {
          <p class="ph__eyebrow">{{ eyebrow() }}</p>
        }
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <p class="ph__sub">{{ subtitle() }}</p>
        }
      </div>
      <div class="ph__actions">
        <ng-content></ng-content>
      </div>
    </header>
  `,
  styles: [
    `
      .ph {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1.15rem;
        margin-bottom: 1.75rem;
        padding: 1.45rem 1.5rem 1.55rem;
        border-radius: 24px;
        border: 2px solid transparent;
        background:
          linear-gradient(var(--eas-surface), var(--eas-surface)) padding-box,
          linear-gradient(135deg, #e4a01a, #1f7a4c 55%, #3d9a6a) border-box;
        box-shadow: 0 22px 48px rgba(20, 38, 28, 0.16);
        overflow: hidden;
        animation: eas-rise-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .ph__glow {
        position: absolute;
        right: -40px;
        top: -50px;
        width: 220px;
        height: 220px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(228, 160, 26, 0.3), transparent 65%);
        pointer-events: none;
      }

      .ph::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 8px;
        background: linear-gradient(180deg, #f0bc48, #e4a01a, #1f7a4c);
        box-shadow: 0 0 18px rgba(228, 160, 26, 0.65);
      }

      .ph__eyebrow {
        display: inline-flex;
        margin: 0 0 0.55rem;
        padding: 0.28rem 0.75rem;
        border-radius: 999px;
        font-size: 0.68rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #1a1408;
        background: linear-gradient(135deg, #e4a01a, #c9840e);
        box-shadow: 0 6px 14px rgba(228, 160, 26, 0.4);
      }

      .ph h1 {
        margin: 0;
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: clamp(1.85rem, 3.2vw, 2.55rem);
        font-weight: 900;
        letter-spacing: -0.05em;
        line-height: 1.05;
        background: linear-gradient(110deg, #14261c 0%, #1f7a4c 55%, #c9840e 130%);
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
      }

      :host-context(html[data-theme='dark']) .ph h1 {
        background: linear-gradient(110deg, #f5faf7 10%, #5ec993 55%, #f0bc48 120%);
        -webkit-background-clip: text;
        background-clip: text;
      }

      .ph__sub {
        margin: 0.55rem 0 0;
        max-width: 44rem;
        font-size: 0.98rem;
        line-height: 1.55;
        color: var(--eas-ink);
        opacity: 0.72;
      }

      .ph__actions {
        position: relative;
        z-index: 1;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.65rem;
      }

      .ph__actions .eas-btn-primary,
      .ph__actions .eas-btn-secondary,
      .ph__actions .eas-btn-ghost,
      .ph__actions .eas-btn-accent {
        text-decoration: none;
      }

      .ph__actions mat-icon {
        font-size: 17px !important;
        width: 17px !important;
        height: 17px !important;
      }
    `
  ]
})
export class PageHeaderComponent {
  readonly eyebrow = input<string>('');
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
}
