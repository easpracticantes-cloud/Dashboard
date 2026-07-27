import { Component, EventEmitter, Output, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Conversation } from '../../../core/models/conversation.model';
import { AvatarComponent } from '../avatar/avatar.component';
import { StatusBadgeComponent } from '../status-badge/status-badge.component';
import { PriorityChipComponent } from '../priority-chip/priority-chip.component';
import { TimeAgoPipe } from '../../pipes/time-ago.pipe';

const CHANNEL_ICON: Record<Conversation['channel'], string> = {
  WHATSAPP: 'chat',
  EMAIL: 'mail',
  WEB: 'language'
};

@Component({
  selector: 'eas-conversation-row',
  standalone: true,
  imports: [MatIconModule, AvatarComponent, StatusBadgeComponent, PriorityChipComponent, TimeAgoPipe],
  template: `
    <button type="button" class="crow" [class.crow--unread]="conversation().unreadCount > 0" (click)="open.emit(conversation())">
      <div class="crow__avatar">
        <eas-avatar [name]="conversation().clientName" [imageUrl]="conversation().clientAvatarUrl" [size]="42"></eas-avatar>
        <span class="crow__channel" [attr.data-channel]="conversation().channel">
          <mat-icon>{{ channelIcon() }}</mat-icon>
        </span>
      </div>

      <div class="crow__body">
        <div class="crow__title-row">
          <span class="crow__name">{{ conversation().clientName }}</span>
          @if (conversation().isImportant) {
            <mat-icon class="crow__star">star</mat-icon>
          }
          @if (conversation().unreadCount > 0) {
            <span class="crow__badge">{{ conversation().unreadCount }}</span>
          }
        </div>
        <span class="crow__phone">{{ conversation().clientPhone }}</span>
        <span class="crow__preview">{{ conversation().lastMessage }}</span>
        @if (conversation().tags.length) {
          <div class="crow__tags">
            @for (tag of conversation().tags.slice(0, 3); track tag.id) {
              <span>{{ tag.label }}</span>
            }
          </div>
        }
      </div>

      <div class="crow__meta">
        <span class="crow__time">{{ conversation().lastMessageAt | timeAgo }}</span>
        <eas-status-badge [status]="conversation().status"></eas-status-badge>
        <eas-priority-chip [priority]="conversation().priority"></eas-priority-chip>
        @if (conversation().assigneeName) {
          <div class="crow__assignee" [title]="conversation().assigneeName">
            <eas-avatar [name]="conversation().assigneeName ?? ''" [size]="22"></eas-avatar>
            <span>{{ conversation().assigneeName }}</span>
          </div>
        }
      </div>
    </button>
  `,
  styles: [
    `
      .crow {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 0.85rem;
        width: 100%;
        padding: 0.85rem 0.9rem;
        border: 1px solid transparent;
        border-radius: 12px;
        background: transparent;
        text-align: left;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
        font: inherit;
        color: inherit;
      }

      @media (min-width: 900px) {
        .crow {
          grid-template-columns: auto 1fr auto;
          align-items: center;
        }
      }

      .crow:hover {
        background: var(--eas-mist);
        border-color: var(--eas-line-soft);
      }

      .crow--unread {
        background: var(--eas-tint-leaf);
      }

      .crow__avatar {
        position: relative;
        flex: none;
      }

      .crow__channel {
        position: absolute;
        right: -2px;
        bottom: -2px;
        display: grid;
        place-items: center;
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: #25d366;
        color: #06110c;
        border: 2px solid var(--eas-surface);
      }

      .crow__channel[data-channel='EMAIL'] {
        background: var(--eas-pine);
      }

      .crow__channel[data-channel='WEB'] {
        background: var(--eas-amber);
      }

      .crow__channel mat-icon {
        font-size: 10px !important;
        width: 10px !important;
        height: 10px !important;
      }

      .crow__body {
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
      }

      .crow__title-row {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        min-width: 0;
      }

      .crow__name {
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--eas-ink);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .crow--unread .crow__name {
        font-weight: 700;
      }

      .crow__star {
        font-size: 14px !important;
        width: 14px !important;
        height: 14px !important;
        color: var(--eas-amber);
      }

      .crow__badge {
        display: inline-grid;
        place-items: center;
        min-width: 18px;
        height: 18px;
        padding: 0 0.3rem;
        border-radius: 999px;
        background: var(--eas-brand);
        color: var(--eas-on-brand);
        font-size: 0.625rem;
        font-weight: 700;
      }

      .crow__phone {
        font-size: 0.6875rem;
        color: var(--eas-muted);
      }

      .crow__preview {
        margin-top: 0.15rem;
        font-size: 0.8125rem;
        color: var(--eas-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .crow--unread .crow__preview {
        color: var(--eas-ink);
        font-weight: 500;
      }

      .crow__tags {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        margin-top: 0.4rem;
      }

      .crow__tags span {
        font-size: 0.625rem;
        font-weight: 600;
        padding: 0.15rem 0.45rem;
        border-radius: 999px;
        background: var(--eas-mist);
        color: var(--eas-pine);
      }

      .crow__meta {
        display: none;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.35rem;
        min-width: 140px;
      }

      @media (min-width: 900px) {
        .crow__meta {
          display: flex;
        }
      }

      .crow__time {
        font-size: 0.6875rem;
        font-weight: 500;
        color: var(--eas-muted);
      }

      .crow__assignee {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        margin-top: 0.15rem;
        max-width: 140px;
      }

      .crow__assignee span {
        font-size: 0.6875rem;
        color: var(--eas-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `
  ]
})
export class ConversationRowComponent {
  readonly conversation = input.required<Conversation>();

  @Output() open = new EventEmitter<Conversation>();

  readonly channelIcon = computed(() => CHANNEL_ICON[this.conversation().channel] ?? 'chat');
}
