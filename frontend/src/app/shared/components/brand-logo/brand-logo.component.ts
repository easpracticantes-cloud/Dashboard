import { Component, input } from '@angular/core';

export type BrandLogoVariant = 'full' | 'mark' | 'lockup' | 'lockup-light';

const LOGO_FULL = 'assets/brand/logo-escuela-aves-salento.png';
const LOGO_MARK = 'assets/brand/logo-escuela-aves-mark.png';
const LOGO_ALT = 'Escuela Aves Salento';

@Component({
  selector: 'eas-brand-logo',
  standalone: true,
  template: `
    @switch (variant()) {
      @case ('full') {
        <img
          class="brand-logo brand-logo--full"
          [src]="logoFull"
          [alt]="logoAlt"
          [style.max-height.px]="height()"
        />
      }
      @case ('mark') {
        <img
          class="brand-logo brand-logo--mark"
          [src]="logoMark"
          [alt]="logoAlt"
          [style.height.px]="height()"
        />
      }
      @case ('lockup-light') {
        <span class="brand-lockup brand-lockup--light" [style.--logo-h.px]="height()">
          <img class="brand-lockup__logo" [src]="logoFull" [alt]="logoAlt" />
          @if (subtitle()) {
            <span class="brand-lockup__sub">{{ subtitle() }}</span>
          }
        </span>
      }
      @default {
        <span class="brand-lockup" [style.--logo-h.px]="height()">
          <img class="brand-lockup__logo" [src]="logoFull" [alt]="logoAlt" />
          @if (subtitle()) {
            <span class="brand-lockup__sub">{{ subtitle() }}</span>
          }
        </span>
      }
    }
  `,
  styles: [
    `
      .brand-logo {
        display: block;
        width: auto;
        object-fit: contain;
      }

      .brand-logo--full {
        width: auto;
        max-width: min(100%, 280px);
        background: #fff;
        border-radius: 16px;
        padding: 0.65rem 0.9rem;
        box-shadow: var(--eas-shadow-md);
      }

      .brand-logo--mark {
        width: auto;
        object-fit: contain;
      }

      .brand-lockup {
        display: inline-flex;
        align-items: center;
        gap: 0.65rem;
        min-width: 0;
      }

      .brand-lockup__logo {
        display: block;
        height: var(--logo-h, 36px);
        width: auto;
        max-width: min(220px, 100%);
        object-fit: contain;
        background: #fff;
        border-radius: 12px;
        padding: 0.28rem 0.45rem;
        box-shadow: 0 6px 16px rgba(20, 38, 28, 0.18);
      }

      .brand-lockup__sub {
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: 0.62rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--eas-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .brand-lockup--light .brand-lockup__logo {
        box-shadow: none;
        border: 1px solid rgba(255, 255, 255, 0.18);
      }

      .brand-lockup--light .brand-lockup__sub {
        color: rgba(248, 250, 249, 0.7);
      }
    `
  ]
})
export class BrandLogoComponent {
  readonly logoFull = LOGO_FULL;
  readonly logoMark = LOGO_MARK;
  readonly logoAlt = LOGO_ALT;
  readonly variant = input<BrandLogoVariant>('lockup');
  readonly height = input<number>(36);
  readonly subtitle = input<string>('SIG');
}
