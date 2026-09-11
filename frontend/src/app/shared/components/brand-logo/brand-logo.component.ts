import { Component, input } from '@angular/core';

export type BrandLogoVariant = 'full' | 'mark' | 'lockup' | 'lockup-light';

const LOGO_MARK = 'assets/brand/logo-escuela-aves-mark.png';
const LOGO_ALT = 'Escuela Aves Salento';

@Component({
  selector: 'eas-brand-logo',
  standalone: true,
  template: `
    @switch (variant()) {
      @case ('mark') {
        <span class="brand-seal" [style.--seal.px]="height()" [attr.aria-label]="logoAlt">
          <img [src]="logoMark" alt="" />
        </span>
      }
      @case ('full') {
        <span class="brand-lockup brand-lockup--stack" [style.--seal.px]="height()">
          <span class="brand-seal">
            <img [src]="logoMark" alt="" />
          </span>
          <span class="brand-lockup__text">
            <span class="brand-lockup__word">escuelaaves</span>
            <span class="brand-lockup__sub">{{ subtitle() || 'Salento' }}</span>
          </span>
        </span>
      }
      @case ('lockup-light') {
        <span class="brand-lockup brand-lockup--light" [style.--seal.px]="height()">
          <span class="brand-seal">
            <img [src]="logoMark" alt="" />
          </span>
          <span class="brand-lockup__text">
            <span class="brand-lockup__word">escuelaaves</span>
            <span class="brand-lockup__sub">{{ subtitle() }}</span>
          </span>
        </span>
      }
      @default {
        <span class="brand-lockup" [style.--seal.px]="height()">
          <span class="brand-seal">
            <img [src]="logoMark" alt="" />
          </span>
          <span class="brand-lockup__text">
            <span class="brand-lockup__word">escuelaaves</span>
            <span class="brand-lockup__sub">{{ subtitle() }}</span>
          </span>
        </span>
      }
    }
  `,
  styles: [
    `
      .brand-seal {
        display: grid;
        place-items: center;
        width: var(--seal, 40px);
        height: var(--seal, 40px);
        flex: none;
        border-radius: 50%;
        background: radial-gradient(circle at 30% 28%, #2f6b4a, #1a3d2c 55%, #0f2418);
        border: 3px solid #e4a01a;
        box-shadow:
          inset 0 -8px 16px rgba(0, 0, 0, 0.18),
          0 0 0 4px rgba(228, 160, 26, 0.18);
      }

      .brand-seal img {
        width: 54%;
        height: 54%;
        object-fit: contain;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.25));
      }

      .brand-lockup {
        display: inline-flex;
        align-items: center;
        gap: 0.7rem;
        min-width: 0;
      }

      .brand-lockup--stack {
        flex-direction: column;
        align-items: flex-start;
        gap: 0.75rem;
      }

      .brand-lockup__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.05;
      }

      .brand-lockup__word {
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: 1.02rem;
        font-weight: 800;
        letter-spacing: -0.04em;
        color: var(--eas-ink);
      }

      .brand-lockup__sub {
        margin-top: 0.16rem;
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

      .brand-lockup--light .brand-lockup__word {
        color: #f8faf9;
      }

      .brand-lockup--light .brand-lockup__sub {
        color: rgba(248, 250, 249, 0.62);
      }
    `
  ]
})
export class BrandLogoComponent {
  readonly logoMark = LOGO_MARK;
  readonly logoAlt = LOGO_ALT;
  readonly variant = input<BrandLogoVariant>('lockup');
  readonly height = input<number>(40);
  readonly subtitle = input<string>('SIG');
}
