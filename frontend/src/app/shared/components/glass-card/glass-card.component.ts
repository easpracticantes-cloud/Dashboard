import { Component, input } from '@angular/core';

@Component({
  selector: 'eas-glass-card',
  standalone: true,
  template: `
    <div class="eas-glass-host" [class.eas-glass-host--padded]="padded()">
      <ng-content></ng-content>
    </div>
  `,
  styles: [
    `
      .eas-glass-host {
        background: var(--eas-glass-bg);
        border: 1px solid var(--eas-glass-border);
        border-radius: 22px;
        box-shadow: var(--eas-shadow-md);
        backdrop-filter: blur(22px) saturate(160%);
        -webkit-backdrop-filter: blur(22px) saturate(160%);
      }

      .eas-glass-host--padded {
        padding: 22px;
      }
    `
  ]
})
export class GlassCardComponent {
  readonly padded = input<boolean>(true);
}
