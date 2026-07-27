import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatInputModule } from '@angular/material/input';
import { ConversationsService } from '../../core/services/conversations.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { Conversation } from '../../core/models/conversation.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

@Component({
  selector: 'eas-history',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatInputModule,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './history.component.html',
  styleUrl: './history.component.scss'
})
export class HistoryComponent {
  private readonly conversationsService = inject(ConversationsService);
  private readonly liveSync = inject(LiveSyncService);

  readonly loading = signal(true);
  readonly items = signal<Conversation[]>([]);
  readonly fromDate = signal<Date | null>(null);
  readonly toDate = signal<Date | null>(null);

  readonly filtered = computed(() => {
    let list = [...this.items()].sort(
      (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
    );
    const from = this.fromDate();
    const to = this.toDate();
    if (from) {
      const start = new Date(from);
      start.setHours(0, 0, 0, 0);
      list = list.filter((c) => new Date(c.lastMessageAt) >= start);
    }
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      list = list.filter((c) => new Date(c.lastMessageAt) <= end);
    }
    return list;
  });

  constructor() {
    effect(() => {
      this.liveSync.tick();
      this.reload();
    });
  }

  reload(): void {
    this.conversationsService.list(0, 500).subscribe((res) => {
      this.items.set(res.items);
      this.loading.set(false);
    });
  }

  clearDates(): void {
    this.fromDate.set(null);
    this.toDate.set(null);
  }
}
