import { Component, computed, effect, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ClientsService } from '../../core/services/clients.service';
import { ConversationsService } from '../../core/services/conversations.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { OpsService } from '../../core/services/ops.service';
import { UsersService } from '../../core/services/users.service';
import { QuoteDto, ReservationDto, SaleDto } from '../../core/services/commercial.service';
import { Client } from '../../core/models/client.model';
import { Conversation } from '../../core/models/conversation.model';
import { UserDto } from '../../core/models/user.model';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { ClientFormDialogComponent } from './client-form-dialog/client-form-dialog.component';

export interface ClientCrmRow {
  client: Client;
  conversations: Conversation[];
  count: number;
  lastInteraction?: string | null;
  priority: string;
  status: string;
}

type QualityFilter = 'ALL' | 'VIP' | 'INACTIVE' | 'UNASSIGNED' | 'NEVER_CONTACTED';

@Component({
  selector: 'eas-clients',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatDialogModule,
    PageHeaderComponent,
    EmptyStateComponent,
    AvatarComponent
  ],
  templateUrl: './clients.component.html',
  styleUrl: './clients.component.scss'
})
export class ClientsComponent {
  private readonly clientsService = inject(ClientsService);
  private readonly conversationsService = inject(ConversationsService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly ops = inject(OpsService);
  private readonly usersService = inject(UsersService);
  private readonly dialog = inject(MatDialog);

  readonly loading = signal(true);
  readonly exporting = signal(false);
  readonly assigning = signal(false);
  readonly search = signal('');
  readonly quality = signal<QualityFilter>('ALL');
  readonly selected = signal<ClientCrmRow | null>(null);
  readonly rows = signal<ClientCrmRow[]>([]);
  readonly advisors = signal<UserDto[]>([]);
  readonly vipIds = signal<Set<string>>(new Set());
  readonly inactiveIds = signal<Set<string>>(new Set());
  readonly unassignedIds = signal<Set<string>>(new Set());
  readonly neverContactedIds = signal<Set<string>>(new Set());

  readonly detailTab = signal<'timeline' | 'commercial'>('timeline');
  readonly loadingCommercial = signal(false);
  readonly clientQuotes = signal<QuoteDto[]>([]);
  readonly clientReservations = signal<ReservationDto[]>([]);
  readonly clientSales = signal<SaleDto[]>([]);

  readonly commercialTotals = computed(() => {
    const salesTotal = this.clientSales()
      .filter((s) => s.status !== 'CANCELLED')
      .reduce((acc, s) => acc + Number(s.amount ?? 0), 0);
    return {
      quotes: this.clientQuotes().length,
      reservations: this.clientReservations().length,
      sales: this.clientSales().length,
      salesTotal
    };
  });

  readonly qualityTabs: { key: QualityFilter; label: string }[] = [
    { key: 'ALL', label: 'Todos' },
    { key: 'VIP', label: 'VIP' },
    { key: 'INACTIVE', label: 'Inactivos' },
    { key: 'UNASSIGNED', label: 'Sin asignar' },
    { key: 'NEVER_CONTACTED', label: 'Sin contacto' }
  ];

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    let list = this.rows();
    const q = this.quality();
    if (q === 'VIP') {
      list = list.filter((r) => this.vipIds().has(r.client.id) || r.client.segment === 'VIP');
    } else if (q === 'INACTIVE') {
      list = list.filter((r) => this.inactiveIds().has(r.client.id));
    } else if (q === 'UNASSIGNED') {
      list = list.filter((r) => this.unassignedIds().has(r.client.id) || !r.client.assignedUserId);
    } else if (q === 'NEVER_CONTACTED') {
      list = list.filter((r) => this.neverContactedIds().has(r.client.id) || !r.client.lastContactAt);
    }
    if (!term) return list;
    return list.filter(
      (r) =>
        r.client.name.toLowerCase().includes(term) ||
        (r.client.phone ?? '').includes(term)
    );
  });

  constructor() {
    effect(() => {
      this.liveSync.tick();
      this.reload();
    });
    this.usersService.list().subscribe((users) => this.advisors.set(users));
  }

  reload(): void {
    this.clientsService.list(0, 500).subscribe((clientsRes) => {
      this.conversationsService.list(0, 500).subscribe((convRes) => {
        const byClient = new Map<string, Conversation[]>();
        for (const c of convRes.items) {
          const list = byClient.get(c.clientId) ?? [];
          list.push(c);
          byClient.set(c.clientId, list);
        }
        const mapped: ClientCrmRow[] = clientsRes.items.map((client) => {
          const conversations = (byClient.get(client.id) ?? []).sort(
            (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          );
          const top = conversations[0];
          return {
            client,
            conversations,
            count: conversations.length,
            lastInteraction: top?.lastMessageAt ?? client.lastContactAt,
            priority: top ? top.priority : 'MEDIUM',
            status: top ? top.status : 'OPEN'
          };
        });
        this.rows.set(mapped);
        this.loading.set(false);
        const sel = this.selected();
        if (sel) {
          const refreshed = mapped.find((r) => r.client.id === sel.client.id);
          if (refreshed) this.selected.set(refreshed);
        }
      });
    });
    this.ops.listVipClients().subscribe((list) => this.vipIds.set(new Set((list ?? []).map((c) => c.id))));
    this.ops.listInactiveClients().subscribe((list) => this.inactiveIds.set(new Set((list ?? []).map((c) => c.id))));
    this.ops.listUnassignedClients().subscribe((list) => this.unassignedIds.set(new Set((list ?? []).map((c) => c.id))));
    this.ops
      .listNeverContactedClients()
      .subscribe((list) => this.neverContactedIds.set(new Set((list ?? []).map((c) => c.id))));
  }

  exportCsv(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.ops.exportClientsCsv().subscribe((blob) => {
      this.exporting.set(false);
      if (blob) this.ops.downloadBlob(blob, 'clientes.csv');
    });
  }

  openCreate(): void {
    const ref = this.dialog.open(ClientFormDialogComponent, { width: '520px', data: {} });
    ref.afterClosed().subscribe((value) => {
      if (!value) return;
      this.clientsService.create(value).subscribe((created) => {
        if (created) this.reload();
      });
    });
  }

  select(row: ClientCrmRow): void {
    this.selected.set(row);
    this.loadCommercial(row.client.id);
  }

  assignAdvisor(userId: string): void {
    const row = this.selected();
    if (!row || !userId || this.assigning()) return;
    this.assigning.set(true);
    this.ops.assignClient(row.client.id, userId).subscribe((updated) => {
      this.assigning.set(false);
      if (updated) {
        this.selected.set({ ...row, client: { ...row.client, ...updated } });
        this.reload();
      }
    });
  }

  markContacted(): void {
    const row = this.selected();
    if (!row || this.assigning()) return;
    this.assigning.set(true);
    this.ops.touchClient(row.client.id).subscribe((updated) => {
      this.assigning.set(false);
      if (updated) {
        this.selected.set({
          ...row,
          client: { ...row.client, ...updated },
          lastInteraction: updated.lastContactAt
        });
        this.reload();
      }
    });
  }

  private loadCommercial(clientId: string): void {
    this.loadingCommercial.set(true);
    this.clientQuotes.set([]);
    this.clientReservations.set([]);
    this.clientSales.set([]);
    this.ops.getQuotesByClient(clientId).subscribe((list) => this.clientQuotes.set(list ?? []));
    this.ops.getReservationsByClient(clientId).subscribe((list) => this.clientReservations.set(list ?? []));
    this.ops.getSalesByClient(clientId).subscribe((list) => {
      this.clientSales.set(list ?? []);
      this.loadingCommercial.set(false);
    });
  }

  commercialStatusLabel(s: string): string {
    return (
      {
        DRAFT: 'Borrador',
        SENT: 'Enviada',
        ACCEPTED: 'Aceptada',
        REJECTED: 'Rechazada',
        CANCELLED: 'Cancelada',
        CONFIRMED: 'Confirmada',
        COMPLETED: 'Completada'
      } as Record<string, string>
    )[s] ?? s;
  }

  priorityLabel(p: string): string {
    return ({ LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' } as Record<string, string>)[p] ?? p;
  }

  statusLabel(s: string): string {
    return ({ OPEN: 'Abierta', PENDING: 'Pendiente', RESOLVED: 'Resuelta', ARCHIVED: 'Archivada' } as Record<string, string>)[s] ?? s;
  }
}
