import { Component, input } from '@angular/core';

export type BrandLogoVariant = 'full' | 'mark' | 'lockup' | 'lockup-light';

@Component({
  selector: 'eas-brand-logo',
  standalone: true,
  template: `
    @switch (variant()) {
      @case ('full') {
        <img
          class="brand-logo brand-logo--full"
          src="assets/brand/logo-escuela-aves.png"
          alt="Escuela Aves Salento"
          [style.max-height.px]="height()"
        />
      }
      @case ('mark') {
        <img
          class="brand-logo brand-logo--mark"
          src="assets/brand/mark-bird.svg"
          alt="Escuela Aves Salento"
          [style.height.px]="height()"
          [style.width.px]="height()"
        />
      }
      @case ('lockup-light') {
        <span class="brand-lockup brand-lockup--light" [style.--mark-size.px]="height()">
          <span class="brand-lockup__mark">
            <img src="assets/brand/mark-bird.svg" alt="" />
          </span>
          <span class="brand-lockup__text">
            <span class="brand-lockup__word">
              <span class="c-escuela">escuela</span><span class="c-aves">aves</span>
            </span>
            <span class="brand-lockup__sub">{{ subtitle() }}</span>
          </span>
        </span>
      }
      @default {
        <span class="brand-lockup" [style.--mark-size.px]="height()">
          <span class="brand-lockup__mark">
            <img src="assets/brand/mark-bird.svg" alt="" />
          </span>
          <span class="brand-lockup__text">
            <span class="brand-lockup__word">
              <span class="c-escuela">escuela</span><span class="c-aves">aves</span>
            </span>
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
        background: var(--eas-surface);
        border-radius: 16px;
        padding: 0.65rem 0.9rem;
        box-shadow: var(--eas-shadow-md);
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
        background: #14261c;
        flex: none;
        box-shadow: 0 6px 16px rgba(20, 38, 28, 0.18);
      }

      .brand-lockup__mark img {
        width: calc(var(--mark-size, 36px) - 4px);
        height: calc(var(--mark-size, 36px) - 4px);
      }

      .brand-lockup__text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.05;
      }

      .brand-lockup__word {
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: 0.95rem;
        font-weight: 800;
        letter-spacing: -0.04em;
      }

      .c-escuela {
        color: var(--eas-ink);
      }

      .c-aves {
        color: var(--eas-leaf);
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
        background: rgba(255, 255, 255, 0.1);
        box-shadow: none;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .brand-lockup--light .c-escuela,
      .brand-lockup--light .c-aves {
        color: #f8faf9;
      }

      .brand-lockup--light .c-aves {
        color: #6bb892;
      }

      .brand-lockup--light .brand-lockup__sub {
        color: rgba(248, 250, 249, 0.55);
      }
    `
  ]
})
export class BrandLogoComponent {
  readonly variant = input<BrandLogoVariant>('lockup');
  readonly height = input<number>(36);
  readonly subtitle = input<string>('SIG · Gestión');
}
