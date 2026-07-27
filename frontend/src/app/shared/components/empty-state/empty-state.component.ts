import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'eas-empty-state',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="es">
      <div class="es__icon">
        <mat-icon [style.font-size.px]="30" [style.width.px]="30" [style.height.px]="30">{{ icon() }}</mat-icon>
      </div>
      <h3>{{ title() }}</h3>
      <p>{{ description() }}</p>
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .es {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.8rem;
        padding: 3.5rem 1.6rem;
        text-align: center;
      }

      .es__icon {
        display: grid;
        place-items: center;
        width: 76px;
        height: 76px;
        border-radius: 24px;
        background:
          radial-gradient(circle at 30% 30%, rgba(228, 160, 26, 0.18), transparent 55%),
          var(--eas-mist);
        color: var(--eas-pine);
        box-shadow: 0 14px 30px rgba(20, 38, 28, 0.08);
        animation: eas-float 3.2s ease-in-out infinite;
      }

      .es h3 {
        margin: 0;
        font-family: 'Montserrat', 'Sora', sans-serif;
        font-size: 1.15rem;
        color: var(--eas-ink);
      }

      .es p {
        margin: 0;
        max-width: 26rem;
        font-size: 0.875rem;
        color: var(--eas-muted);
        line-height: 1.55;
      }

      @keyframes eas-float {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-6px);
        }
      }
    `
  ]
})
export class EmptyStateComponent {
  readonly icon = input<string>('inbox');
  readonly title = input<string>('Nada por aquí todavía');
  readonly description = input<string>('Cuando haya información disponible, la verás en este espacio.');
}
