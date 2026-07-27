import { Component, input } from '@angular/core';

@Component({
  selector: 'eas-page-header',
  standalone: true,
  template: `
    <header class="ph">
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
        gap: 1.05rem;
        margin-bottom: 1.55rem;
        padding: 1.15rem 1.25rem 1.2rem;
        border-radius: 18px;
        border: 1px solid var(--eas-line-soft);
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--eas-surface) 88%, var(--eas-mist)), var(--eas-surface));
        box-shadow: var(--eas-shadow-sm);
        overflow: hidden;
        animation: eas-rise-in 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .ph::before {
        content: '';
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 4px;
        background: linear-gradient(180deg, var(--eas-amber), var(--eas-leaf));
      }

      .ph__eyebrow {
        margin: 0 0 0.35rem;
        font-size: 0.68rem;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--eas-amber-deep);
      }

      .ph h1 {
        margin: 0;
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: clamp(1.55rem, 2.5vw, 2.15rem);
        font-weight: 800;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }

      .ph__sub {
        margin: 0.5rem 0 0;
        max-width: 44rem;
        font-size: 0.9rem;
        line-height: 1.55;
        color: var(--eas-muted);
      }

      .ph__actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.6rem;
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
