import { AfterViewInit, Component, computed, effect, inject, signal, ViewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ConversationsService } from '../../../core/services/conversations.service';
import { ClientsService } from '../../../core/services/clients.service';
import { UsersService } from '../../../core/services/users.service';
import { LiveSyncService } from '../../../core/services/live-sync.service';
import { OpsService } from '../../../core/services/ops.service';
import { AuthService } from '../../../core/services/auth.service';
import { CrmFilterStore } from '../../../core/services/crm-filter.store';
import { AnalyticsFilter } from '../../../core/models/analytics-filter.model';
import { Conversation, ConversationPriority, ConversationStatus } from '../../../core/models/conversation.model';
import { Client } from '../../../core/models/client.model';
import { UserDto } from '../../../core/models/user.model';
import { PageHeaderComponent } from '../../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import {
  ConversationFormDialogComponent,
  ConversationFormResult
} from '../conversation-form-dialog/conversation-form-dialog.component';
import { ConversationEditDialogComponent } from '../conversation-edit-dialog/conversation-edit-dialog.component';
import { buildYearOptions, calendarMonth, calendarYear } from '../../../shared/utils/year-options';

const IMPORTANCE_TO_PRIORITY: Record<string, ConversationPriority> = {
  Baja: 'LOW',
  Media: 'MEDIUM',
  Alta: 'HIGH',
  Urgente: 'URGENT'
};

type SmartView = 'ALL' | 'MINE' | 'UNASSIGNED' | 'HIGH' | 'STALE';

@Component({
  selector: 'eas-conversations-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatIconModule,
    MatDialogModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatCheckboxModule,
    PageHeaderComponent,
    EmptyStateComponent
  ],
  templateUrl: './conversations-list.component.html',
  styleUrl: './conversations-list.component.scss'
})
export class ConversationsListComponent implements AfterViewInit {
  private readonly conversationsService = inject(ConversationsService);
  private readonly clientsService = inject(ClientsService);
  private readonly usersService = inject(UsersService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly ops = inject(OpsService);
  private readonly auth = inject(AuthService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly filters = inject(CrmFilterStore);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly empty = signal(true);
  readonly bulkBusy = signal(false);
  readonly clients = signal<Client[]>([]);
  readonly advisors = signal<UserDto[]>([]);
  readonly dataSource = new MatTableDataSource<Conversation>([]);
  readonly smartView = signal<SmartView>('ALL');
  readonly selectedIds = signal<Set<string>>(new Set());
  readonly staleIds = signal<Set<string>>(new Set());
  readonly bulkStatus = signal<ConversationStatus>('PENDING');
  readonly bulkAssignee = signal<string>('');

  readonly filter = this.filters.filter;
  readonly activeStatus = computed<ConversationStatus | 'TODOS'>(
    () => (this.filter().status as ConversationStatus | 'TODOS') ?? 'TODOS'
  );
  readonly selectedCount = computed(() => this.selectedIds().size);

  readonly years = buildYearOptions();
  readonly months = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];
  readonly importanceOptions = ['Baja', 'Media', 'Alta', 'Urgente'];

  private all: Conversation[] = [];

  readonly displayedColumns = [
    'select',
    'phone',
    'name',
    'date',
    'time',
    'lastMessage',
    'importance',
    'status',
    'category',
    'assignee',
    'notes',
    'actions'
  ];

  readonly statusTabs: { key: ConversationStatus | 'TODOS'; label: string }[] = [
    { key: 'TODOS', label: 'Todas' },
    { key: 'OPEN', label: 'Abiertas' },
    { key: 'PENDING', label: 'Pendientes' },
    { key: 'RESOLVED', label: 'Resueltas' },
    { key: 'ARCHIVED', label: 'Archivadas' }
  ];

  readonly smartTabs: { key: SmartView; label: string; icon: string }[] = [
    { key: 'ALL', label: 'Vista completa', icon: 'inbox' },
    { key: 'MINE', label: 'Mías', icon: 'person' },
    { key: 'UNASSIGNED', label: 'Sin asignar', icon: 'person_off' },
    { key: 'HIGH', label: 'Alta prioridad', icon: 'priority_high' },
    { key: 'STALE', label: 'Estancadas', icon: 'hourglass_bottom' }
  ];

  constructor() {
    this.dataSource.filterPredicate = () => true;
    this.dataSource.sortingDataAccessor = (row, column) => {
      switch (column) {
        case 'phone':
          return row.clientPhone;
        case 'name':
          return row.clientName;
        case 'date':
          return row.lastMessageAt;
        case 'importance':
          return row.priority;
        case 'status':
          return row.status;
        default:
          return (row as never)[column];
      }
    };

    effect(() => {
      this.liveSync.tick();
      this.reload();
    });

    effect(() => {
      this.filters.filter();
      this.smartView();
      this.staleIds();
      this.applyFilters();
    });

    // Clientes/asesores/stale en background — no bloquean la tabla
    queueMicrotask(() => {
      this.clientsService.list().subscribe((res) => this.clients.set(res.items));
      this.usersService.list().subscribe((users) => this.advisors.set(users));
      this.ops.listStaleConversationIds(7).subscribe((ids) => this.staleIds.set(new Set(ids)));
    });

    const quickSearch = this.route.snapshot.queryParamMap.get('q');
    if (quickSearch) {
      this.filters.patch({ search: quickSearch });
    }
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  reload(): void {
    this.loading.set(true);
    // First paint: primera página. Luego hidrata el resto sin bloquear la UI.
    this.conversationsService.list(0, 100).subscribe((res) => {
      this.all = res.items;
      this.applyFilters();
      this.loading.set(false);
      if ((res.totalPages || 1) > 1) {
        this.conversationsService.listAll(500).subscribe((full) => {
          this.all = full.items;
          this.applyFilters();
        });
      }
    });
  }

  patchFilter(partial: Partial<AnalyticsFilter>): void {
    this.filters.patch(partial);
  }

  setStatusTab(key: ConversationStatus | 'TODOS'): void {
    this.patchFilter({ status: key === 'TODOS' ? null : key });
  }

  setSmartView(view: SmartView): void {
    this.smartView.set(view);
    this.clearSelection();
  }

  clearFilters(): void {
    this.filters.clear();
    this.smartView.set('ALL');
    this.clearSelection();
  }

  applyFilters(): void {
    const f = this.filters.filter();
    let list = this.all;

    if (f.status) {
      list = list.filter((c) => c.status === f.status);
    }
    if (f.importance) {
      const priority = IMPORTANCE_TO_PRIORITY[f.importance];
      if (priority) {
        list = list.filter((c) => c.priority === priority);
      }
    }
    if (f.category) {
      const term = f.category.toLowerCase();
      list = list.filter((c) => (c.category ?? c.tags[0]?.label ?? '').toLowerCase().includes(term));
    }
    if (f.advisorId) {
      list = list.filter((c) => c.assignedUserId === f.advisorId);
    }
    if (f.name) {
      const term = f.name.toLowerCase();
      list = list.filter((c) => c.clientName.toLowerCase().includes(term));
    }
    if (f.phone) {
      list = list.filter((c) => c.clientPhone.includes(f.phone as string));
    }
    if (f.year) {
      list = list.filter((c) => calendarYear(c.lastMessageAt) === f.year);
    }
    if (f.month) {
      list = list.filter((c) => calendarMonth(c.lastMessageAt) === f.month);
    }
    if (f.search) {
      const term = f.search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.clientName.toLowerCase().includes(term) ||
          c.lastMessage.toLowerCase().includes(term) ||
          c.clientPhone.includes(term) ||
          (c.notes ?? '').toLowerCase().includes(term) ||
          c.tags.some((t) => t.label.toLowerCase().includes(term))
      );
    }

    const view = this.smartView();
    const me = this.auth.currentUser()?.id;
    if (view === 'MINE' && me) {
      list = list.filter((c) => c.assignedUserId === me);
    } else if (view === 'UNASSIGNED') {
      list = list.filter((c) => !c.assignedUserId);
    } else if (view === 'HIGH') {
      list = list.filter((c) => c.priority === 'HIGH' || c.priority === 'URGENT');
    } else if (view === 'STALE') {
      const stale = this.staleIds();
      list = list.filter((c) => stale.has(c.id));
    }

    this.dataSource.data = list;
    this.empty.set(list.length === 0);
    if (this.paginator) {
      this.dataSource.paginator = this.paginator;
    }
    if (this.sort) {
      this.dataSource.sort = this.sort;
    }
  }

  isSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  toggleRow(id: string, checked: boolean, event?: Event): void {
    event?.stopPropagation();
    const next = new Set(this.selectedIds());
    if (checked) {
      next.add(id);
    } else {
      next.delete(id);
    }
    this.selectedIds.set(next);
  }

  toggleAllVisible(checked: boolean): void {
    const next = new Set(this.selectedIds());
    for (const row of this.dataSource.data) {
      if (checked) {
        next.add(row.id);
      } else {
        next.delete(row.id);
      }
    }
    this.selectedIds.set(next);
  }

  allVisibleSelected(): boolean {
    const rows = this.dataSource.data;
    return rows.length > 0 && rows.every((r) => this.selectedIds().has(r.id));
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  applyBulkStatus(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length || this.bulkBusy()) {
      return;
    }
    this.bulkBusy.set(true);
    this.ops.bulkUpdateStatus(ids, this.bulkStatus()).subscribe((n) => {
      this.bulkBusy.set(false);
      if (n > 0) {
        this.clearSelection();
        this.reload();
      }
    });
  }

  applyBulkAssign(): void {
    const ids = [...this.selectedIds()];
    const userId = this.bulkAssignee();
    if (!ids.length || !userId || this.bulkBusy()) {
      return;
    }
    this.bulkBusy.set(true);
    this.ops.bulkAssign(ids, userId).subscribe((n) => {
      this.bulkBusy.set(false);
      if (n > 0) {
        this.clearSelection();
        this.reload();
      }
    });
  }

  markSelectedRead(): void {
    const ids = [...this.selectedIds()];
    if (!ids.length || this.bulkBusy()) {
      return;
    }
    this.bulkBusy.set(true);
    let pending = ids.length;
    for (const id of ids) {
      this.ops.markConversationRead(id).subscribe(() => {
        pending -= 1;
        if (pending <= 0) {
          this.bulkBusy.set(false);
          this.clearSelection();
          this.reload();
        }
      });
    }
  }

  openCreate(): void {
    const ref = this.dialog.open(ConversationFormDialogComponent, {
      width: '520px',
      data: { clients: this.clients(), advisors: this.advisors() }
    });
    ref.afterClosed().subscribe((result?: ConversationFormResult) => {
      if (!result) return;
      this.creating.set(true);
      this.conversationsService.create(result).subscribe((created) => {
        this.creating.set(false);
        if (created) {
          this.reload();
          void this.router.navigate(['/app/conversations', created.id]);
        }
      });
    });
  }

  openRow(row: Conversation): void {
    void this.router.navigate(['/app/conversations', row.id]);
  }

  openHistory(row: Conversation, event: Event): void {
    event.stopPropagation();
    void this.router.navigate(['/app/conversations', row.id]);
  }

  openEdit(row: Conversation, event: Event): void {
    event.stopPropagation();
    const ref = this.dialog.open(ConversationEditDialogComponent, {
      panelClass: 'eas-dialog-panel',
      data: { conversation: row, advisors: this.advisors() }
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.conversationsService.update(row.id, result).subscribe((updated) => updated && this.reload());
    });
  }

  removeRow(row: Conversation, event: Event): void {
    event.stopPropagation();
    if (!confirm(`¿Eliminar la conversación de ${row.clientName}?`)) return;
    this.conversationsService.remove(row.id).subscribe((ok) => ok && this.reload());
  }

  statusLabel(status: ConversationStatus): string {
    return ({ OPEN: 'Abierta', PENDING: 'Pendiente', RESOLVED: 'Resuelta', ARCHIVED: 'Archivada' } as const)[status];
  }

  priorityLabel(priority: ConversationPriority): string {
    return ({ LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', URGENT: 'Urgente' } as const)[priority];
  }
}
