import { Component, input } from '@angular/core';

export type BrandLogoVariant = 'full' | 'mark' | 'lockup' | 'lockup-light';

const LOGO_SRC = 'assets/brand/logo-eas-holding.png';
const LOGO_ALT = 'EAS Holding Empresarial';

@Component({
  selector: 'eas-brand-logo',
  standalone: true,
  template: `
    @switch (variant()) {
      @case ('full') {
        <img
          class="brand-logo brand-logo--full"
          [src]="logoSrc"
          [alt]="logoAlt"
          [style.max-height.px]="height()"
        />
      }
      @case ('mark') {
        <img
          class="brand-logo brand-logo--mark"
          [src]="logoSrc"
          [alt]="logoAlt"
          [style.height.px]="height()"
        />
      }
      @case ('lockup-light') {
        <span class="brand-lockup brand-lockup--light" [style.--mark-size.px]="height()">
          <span class="brand-lockup__mark">
            <img [src]="logoSrc" alt="" />
          </span>
          <span class="brand-lockup__text">
            <span class="brand-lockup__word">eas</span>
            <span class="brand-lockup__sub">{{ subtitle() }}</span>
          </span>
        </span>
      }
      @default {
        <span class="brand-lockup" [style.--mark-size.px]="height()">
          <span class="brand-lockup__mark">
            <img [src]="logoSrc" alt="" />
          </span>
          <span class="brand-lockup__text">
            <span class="brand-lockup__word">eas</span>
            <span class="brand-lockup__sub">{{ subtitle() }}</span>
          </span>
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
        background: #fff;
        border-radius: 12px;
        padding: 0.2rem;
        object-fit: contain;
      }

      .brand-lockup {
        display: inline-flex;
        align-items: center;
        gap: 0.7rem;
        min-width: 0;
      }

      .brand-lockup__mark {
        display: grid;
        place-items: center;
        width: calc(var(--mark-size, 36px) + 10px);
        height: calc(var(--mark-size, 36px) + 10px);
        border-radius: 12px;
        background: #fff;
        flex: none;
        box-shadow: 0 6px 16px rgba(20, 38, 28, 0.18);
        overflow: hidden;
      }

      .brand-lockup__mark img {
        width: calc(var(--mark-size, 36px) + 2px);
        height: calc(var(--mark-size, 36px) + 2px);
        object-fit: contain;
      }

      .brand-lockup__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.05;
      }

      .brand-lockup__word {
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: 1.05rem;
        font-weight: 800;
        letter-spacing: -0.05em;
        color: var(--eas-ink);
      }

      .brand-lockup__sub {
        margin-top: 0.18rem;
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: 0.62rem;
        font-weight: 500;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--eas-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .brand-lockup--light .brand-lockup__mark {
        background: #fff;
        box-shadow: none;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .brand-lockup--light .brand-lockup__word {
        color: #f8faf9;
      }

      .brand-lockup--light .brand-lockup__sub {
        color: rgba(248, 250, 249, 0.55);
      }
    `
  ]
})
export class BrandLogoComponent {
  readonly logoSrc = LOGO_SRC;
  readonly logoAlt = LOGO_ALT;
  readonly variant = input<BrandLogoVariant>('lockup');
  readonly height = input<number>(36);
  readonly subtitle = input<string>('SIG');
}
