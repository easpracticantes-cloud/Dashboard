import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ConversationsService } from '../../../core/services/conversations.service';
import { UsersService } from '../../../core/services/users.service';
import { OpsService } from '../../../core/services/ops.service';
import { AiQuoteService, AiQuoteSuggestion } from '../../../core/services/ai-quote.service';
import {
  AiAssistService,
  ConversationSummary,
  SentimentInsight,
  SentimentValue
} from '../../../core/services/ai-assist.service';
import {
  Conversation,
  ConversationPriority,
  ConversationStatus,
  MessageDto,
  tagColor
} from '../../../core/models/conversation.model';
import { UserDto } from '../../../core/models/user.model';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge.component';
import { PriorityChipComponent } from '../../../shared/components/priority-chip/priority-chip.component';
import { TimeAgoPipe } from '../../../shared/pipes/time-ago.pipe';
import { AiQuoteDialogComponent } from '../ai-quote-dialog/ai-quote-dialog.component';

@Component({
  selector: 'eas-conversation-detail',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatIconModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    AvatarComponent,
    StatusBadgeComponent,
    PriorityChipComponent,
    TimeAgoPipe
  ],
  templateUrl: './conversation-detail.component.html',
  styleUrl: './conversation-detail.component.scss'
})
export class ConversationDetailComponent {
  private readonly conversationsService = inject(ConversationsService);
  private readonly usersService = inject(UsersService);
  private readonly ops = inject(OpsService);
  private readonly aiQuote = inject(AiQuoteService);
  private readonly aiAssist = inject(AiAssistService);
  private readonly dialog = inject(MatDialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly conversation = signal<Conversation | null>(null);
  readonly messages = signal<MessageDto[]>([]);
  readonly replyText = signal('');
  readonly sending = signal(false);
  readonly actionBusy = signal(false);
  readonly advisors = signal<UserDto[]>([]);
  readonly suggestion = signal<AiQuoteSuggestion | null>(null);
  readonly aiLoading = signal(false);
  private aiDialogOpen = false;

  readonly sentiment = signal<SentimentInsight | null>(null);
  readonly summary = signal<ConversationSummary | null>(null);
  readonly summaryLoading = signal(false);
  readonly replyLoading = signal(false);
  readonly newLabel = signal('');
  readonly transferUserId = signal('');

  readonly sentimentLabels: Record<string, string> = {
    POSITIVO: 'Positivo',
    NEUTRO: 'Neutral',
    RIESGO: 'En riesgo'
  };
  readonly urgencyLabels: Record<string, string> = {
    ALTA: 'Urgencia alta',
    MEDIA: 'Urgencia media',
    BAJA: 'Urgencia baja'
  };

  readonly statusOptions: ConversationStatus[] = ['OPEN', 'PENDING', 'RESOLVED', 'ARCHIVED'];
  readonly priorityOptions: ConversationPriority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  readonly statusLabels: Record<ConversationStatus, string> = {
    OPEN: 'Abierta',
    PENDING: 'Pendiente',
    RESOLVED: 'Resuelta',
    ARCHIVED: 'Archivada'
  };

  readonly priorityLabels: Record<ConversationPriority, string> = {
    LOW: 'Baja',
    MEDIUM: 'Media',
    HIGH: 'Alta',
    URGENT: 'Urgente'
  };

  readonly conversationId = computed(() => this.route.snapshot.paramMap.get('id') ?? '');

  constructor() {
    const id = this.conversationId();
    this.conversationsService.getById(id).subscribe((conversation) => {
      this.conversation.set(conversation ?? null);
    });
    this.conversationsService.getThread(id).subscribe((messages) => {
      this.messages.set(messages);
      this.loading.set(false);
    });
    this.usersService.list().subscribe((users) => this.advisors.set(users));
    this.loadSuggestion(id);
    this.loadSentiment(id);
  }

  private loadSuggestion(id: string): void {
    if (!id) {
      return;
    }
    this.aiLoading.set(true);
    this.aiQuote.getSuggestion(id).subscribe((suggestion) => {
      this.suggestion.set(suggestion);
      this.aiLoading.set(false);
    });
  }

  private loadSentiment(id: string): void {
    if (!id) {
      return;
    }
    this.aiAssist.sentiment(id).subscribe((s) => this.sentiment.set(s));
  }

  suggestReply(): void {
    const id = this.conversationId();
    if (!id || this.replyLoading()) {
      return;
    }
    this.replyLoading.set(true);
    this.aiAssist.suggestReply(id).subscribe((res) => {
      this.replyLoading.set(false);
      if (res?.reply) {
        this.replyText.set(res.reply);
      }
    });
  }

  loadSummary(): void {
    const id = this.conversationId();
    if (!id || this.summaryLoading()) {
      return;
    }
    this.summaryLoading.set(true);
    this.aiAssist.summarize(id).subscribe((res) => {
      this.summary.set(res);
      this.summaryLoading.set(false);
    });
  }

  openAiQuote(): void {
    const suggestion = this.suggestion();
    if (!suggestion || this.aiDialogOpen) {
      return;
    }
    this.aiDialogOpen = true;
    const ref = this.dialog.open(AiQuoteDialogComponent, {
      panelClass: 'eas-ai-quote-panel',
      backdropClass: 'eas-command-palette-backdrop',
      autoFocus: false,
      maxWidth: '95vw',
      data: { conversationId: this.conversationId(), suggestion }
    });
    ref.afterClosed().subscribe(() => {
      this.aiDialogOpen = false;
    });
  }

  senderLabel(message: MessageDto): string {
    if (message.senderType === 'CLIENT') {
      return this.conversation()?.clientName ?? 'Cliente';
    }
    if (message.senderType === 'AGENT') {
      return message.agentUserName ?? 'Asesor';
    }
    return 'Sistema';
  }

  send(): void {
    const body = this.replyText().trim();
    const id = this.conversationId();
    if (!body || this.sending()) {
      return;
    }
    this.sending.set(true);
    this.conversationsService.sendMessage(id, body).subscribe((message) => {
      if (message) {
        this.messages.update((list) => [...list, message]);
      }
      this.replyText.set('');
      this.sending.set(false);
    });
  }

  changeStatus(status: ConversationStatus): void {
    const conversation = this.conversation();
    if (!conversation) return;
    this.conversation.set({ ...conversation, status });
    this.conversationsService.updateStatus(conversation.id, status).subscribe();
  }

  changePriority(priority: ConversationPriority): void {
    const conversation = this.conversation();
    if (!conversation) return;
    this.conversation.set({ ...conversation, priority });
    this.conversationsService.updatePriority(conversation.id, priority).subscribe();
  }

  changeAssignee(assignedUserId: string): void {
    const conversation = this.conversation();
    if (!conversation || !assignedUserId) return;
    const advisor = this.advisors().find((u) => u.id === assignedUserId);
    this.conversation.set({
      ...conversation,
      assignedUserId,
      assigneeName: advisor?.fullName ?? conversation.assigneeName
    });
    this.conversationsService.assign(conversation.id, assignedUserId).subscribe();
  }

  transferTo(userId: string): void {
    const conversation = this.conversation();
    this.transferUserId.set('');
    if (!conversation || !userId || this.actionBusy()) return;
    const advisor = this.advisors().find((u) => u.id === userId);
    if (!confirm(`¿Transferir esta conversación a ${advisor?.fullName ?? 'otro asesor'}?`)) return;
    this.actionBusy.set(true);
    this.ops.transferConversation(conversation.id, userId).subscribe((ok) => {
      this.actionBusy.set(false);
      if (ok) {
        this.conversation.set({
          ...conversation,
          assignedUserId: userId,
          assigneeName: advisor?.fullName ?? conversation.assigneeName
        });
      }
    });
  }

  closeWithNotes(): void {
    const conversation = this.conversation();
    if (!conversation || this.actionBusy()) return;
    const notes = prompt('Nota de cierre (opcional):') ?? undefined;
    this.actionBusy.set(true);
    this.ops.closeConversation(conversation.id, notes || undefined).subscribe((ok) => {
      this.actionBusy.set(false);
      if (ok) this.conversation.set({ ...conversation, status: 'RESOLVED', notes: notes || conversation.notes });
    });
  }

  archive(): void {
    const conversation = this.conversation();
    if (!conversation || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.ops.archiveConversation(conversation.id).subscribe((ok) => {
      this.actionBusy.set(false);
      if (ok) this.conversation.set({ ...conversation, status: 'ARCHIVED' });
    });
  }

  reopen(): void {
    const conversation = this.conversation();
    if (!conversation || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.ops.reopenConversation(conversation.id).subscribe((ok) => {
      this.actionBusy.set(false);
      if (ok) this.conversation.set({ ...conversation, status: 'OPEN' });
    });
  }

  addLabel(): void {
    const conversation = this.conversation();
    const label = this.newLabel().trim();
    if (!conversation || !label || this.actionBusy()) return;
    if (conversation.tags.some((t) => t.label.toLowerCase() === label.toLowerCase())) {
      this.newLabel.set('');
      return;
    }
    this.actionBusy.set(true);
    this.ops.addConversationLabels(conversation.id, [label]).subscribe((ok) => {
      this.actionBusy.set(false);
      if (ok) {
        this.conversation.set({
          ...conversation,
          tags: [...conversation.tags, { id: label, label, color: tagColor(label) }]
        });
        this.newLabel.set('');
      }
    });
  }

  removeLabel(label: string): void {
    const conversation = this.conversation();
    if (!conversation || this.actionBusy()) return;
    this.actionBusy.set(true);
    this.ops.removeConversationLabels(conversation.id, [label]).subscribe((ok) => {
      this.actionBusy.set(false);
      if (ok) {
        this.conversation.set({
          ...conversation,
          tags: conversation.tags.filter((t) => t.label !== label)
        });
      }
    });
  }

  sentimentIcon(value: SentimentValue): string {
    if (value === 'POSITIVO') {
      return 'sentiment_satisfied';
    }
    if (value === 'RIESGO') {
      return 'sentiment_dissatisfied';
    }
    return 'sentiment_neutral';
  }

  goBack(): void {
    void this.router.navigate(['/app/conversations']);
  }
}
