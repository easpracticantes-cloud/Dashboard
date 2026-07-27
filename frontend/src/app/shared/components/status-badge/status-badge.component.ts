import { Component, computed, input } from '@angular/core';
import { ConversationStatus } from '../../../core/models/conversation.model';

const STATUS_MAP: Record<ConversationStatus, { label: string; tone: string }> = {
  OPEN: { label: 'Abierta', tone: 'open' },
  PENDING: { label: 'Pendiente', tone: 'pending' },
  RESOLVED: { label: 'Resuelta', tone: 'resolved' },
  ARCHIVED: { label: 'Archivada', tone: 'archived' }
};

@Component({
  selector: 'eas-status-badge',
  standalone: true,
  template: `
    <span class="badge" [attr.data-tone]="visual().tone">
      <i></i>
      {{ visual().label }}
    </span>
  `,
  styles: [
    `
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.35rem;
        height: 22px;
        padding: 0 0.55rem;
        border-radius: 999px;
        font-size: 0.6875rem;
        font-weight: 600;
        letter-spacing: 0.01em;
        border: 1px solid transparent;
      }

      .badge i {
        width: 5px;
        height: 5px;
        border-radius: 999px;
        background: currentColor;
      }

      .badge[data-tone='open'] {
        color: #1d6b8f;
        background: #eef7fb;
        border-color: #d2e8f2;
      }

      .badge[data-tone='pending'] {
        color: #9a6b14;
        background: #fbf5e8;
        border-color: #f0e0b8;
      }

      .badge[data-tone='resolved'] {
        color: var(--eas-pine);
        background: var(--eas-mist);
        border-color: #cfe0d6;
      }

      .badge[data-tone='archived'] {
        color: #6b7670;
        background: #f1f3f2;
        border-color: #dce4e0;
      }

      :host-context(html[data-theme='dark']) .badge[data-tone='open'] {
        color: #7ec8e8;
        background: rgba(126, 200, 232, 0.14);
        border-color: rgba(126, 200, 232, 0.28);
      }

      :host-context(html[data-theme='dark']) .badge[data-tone='pending'] {
        color: #f0bc48;
        background: rgba(240, 188, 72, 0.14);
        border-color: rgba(240, 188, 72, 0.28);
      }

      :host-context(html[data-theme='dark']) .badge[data-tone='resolved'] {
        color: #6fd5a1;
        background: rgba(111, 213, 161, 0.14);
        border-color: rgba(111, 213, 161, 0.28);
      }

      :host-context(html[data-theme='dark']) .badge[data-tone='archived'] {
        color: #c5d4cb;
        background: rgba(197, 212, 203, 0.12);
        border-color: rgba(197, 212, 203, 0.22);
      }
    `
  ]
})
export class StatusBadgeComponent {
  readonly status = input.required<ConversationStatus>();
  readonly visual = computed(() => STATUS_MAP[this.status()]);
}
