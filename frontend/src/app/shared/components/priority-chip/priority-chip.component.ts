import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { ConversationPriority } from '../../../core/models/conversation.model';

const PRIORITY_MAP: Record<ConversationPriority, { label: string; tone: string; icon: string }> = {
  URGENT: { label: 'Urgente', tone: 'urgent', icon: 'priority_high' },
  HIGH: { label: 'Alta', tone: 'high', icon: 'keyboard_double_arrow_up' },
  MEDIUM: { label: 'Media', tone: 'medium', icon: 'drag_handle' },
  LOW: { label: 'Baja', tone: 'low', icon: 'keyboard_arrow_down' }
};

@Component({
  selector: 'eas-priority-chip',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <span class="prio" [attr.data-tone]="visual().tone">
      <mat-icon>{{ visual().icon }}</mat-icon>
      {{ visual().label }}
    </span>
  `,
  styles: [
    `
      .prio {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        height: 22px;
        padding: 0 0.5rem 0 0.3rem;
        border-radius: 999px;
        font-size: 0.6875rem;
        font-weight: 600;
        border: 1px solid transparent;
      }

      .prio mat-icon {
        font-size: 14px !important;
        width: 14px !important;
        height: 14px !important;
      }

      .prio[data-tone='urgent'] {
        color: #a33a30;
        background: #fdeceb;
        border-color: #f3c7c3;
      }

      .prio[data-tone='high'] {
        color: var(--eas-danger);
        background: #fdf2f0;
        border-color: #f0c9c4;
      }

      .prio[data-tone='medium'] {
        color: #9a6b14;
        background: #fbf5e8;
        border-color: #f0e0b8;
      }

      .prio[data-tone='low'] {
        color: #6b7670;
        background: #f1f3f2;
        border-color: #dce4e0;
      }

      :host-context(html[data-theme='dark']) .prio[data-tone='urgent'] {
        color: #f0958c;
        background: rgba(240, 149, 140, 0.16);
        border-color: rgba(240, 149, 140, 0.3);
      }

      :host-context(html[data-theme='dark']) .prio[data-tone='high'] {
        color: #f0a89f;
        background: rgba(240, 149, 140, 0.12);
        border-color: rgba(240, 149, 140, 0.25);
      }

      :host-context(html[data-theme='dark']) .prio[data-tone='medium'] {
        color: #f0bc48;
        background: rgba(240, 188, 72, 0.14);
        border-color: rgba(240, 188, 72, 0.28);
      }

      :host-context(html[data-theme='dark']) .prio[data-tone='low'] {
        color: #c5d4cb;
        background: rgba(197, 212, 203, 0.12);
        border-color: rgba(197, 212, 203, 0.22);
      }
    `
  ]
})
export class PriorityChipComponent {
  readonly priority = input.required<ConversationPriority>();
  readonly visual = computed(() => PRIORITY_MAP[this.priority()]);
}
