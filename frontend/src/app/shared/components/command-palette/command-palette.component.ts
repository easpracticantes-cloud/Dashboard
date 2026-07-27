import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { debounceTime, distinctUntilChanged, Subject, switchMap, of, catchError, forkJoin, map } from 'rxjs';
import { OpsService } from '../../../core/services/ops.service';
import { NAV_ITEMS } from '../../../core/config/nav-items';

export interface CommandItem {
  id: string;
  kind: 'nav' | 'client' | 'conversation' | 'action';
  title: string;
  subtitle?: string;
  icon: string;
  route: string;
  queryParams?: Record<string, string>;
}

@Component({
  selector: 'eas-command-palette',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule],
  templateUrl: './command-palette.component.html',
  styleUrl: './command-palette.component.scss'
})
export class CommandPaletteComponent implements OnInit {
  private readonly dialogRef = inject(MatDialogRef<CommandPaletteComponent>);
  private readonly router = inject(Router);
  private readonly ops = inject(OpsService);
  private readonly query$ = new Subject<string>();

  @ViewChild('queryInput') queryInput?: ElementRef<HTMLInputElement>;

  readonly query = signal('');
  readonly loading = signal(false);
  readonly activeIndex = signal(0);
  readonly results = signal<CommandItem[]>(this.defaultNav());

  ngOnInit(): void {
    this.query$
      .pipe(
        debounceTime(180),
        distinctUntilChanged(),
        switchMap((q) => {
          const term = q.trim();
          if (term.length < 2) {
            this.loading.set(false);
            return of(this.defaultNav(term));
          }
          this.loading.set(true);
          return forkJoin({
            clients: this.ops.searchClients(term).pipe(catchError(() => of([]))),
            conversations: this.ops.searchConversations(term).pipe(catchError(() => of([])))
          }).pipe(
            map(({ clients, conversations }) => {
              const nav = this.defaultNav(term);
              const clientItems: CommandItem[] = clients.slice(0, 6).map((c) => ({
                id: `client-${c.id}`,
                kind: 'client' as const,
                title: c.name,
                subtitle: [c.phone, c.email].filter(Boolean).join(' · ') || 'Cliente CRM',
                icon: 'person',
                route: '/app/clients',
                queryParams: { q: c.name }
              }));
              const convItems: CommandItem[] = conversations.slice(0, 6).map((c) => ({
                id: `conv-${c.id}`,
                kind: 'conversation' as const,
                title: c.clientName || 'Conversación',
                subtitle: c.lastMessagePreview || c.status || 'Inbox',
                icon: 'forum',
                route: '/app/conversations',
                queryParams: { id: c.id }
              }));
              return [...nav, ...clientItems, ...convItems];
            })
          );
        })
      )
      .subscribe((items) => {
        this.results.set(items);
        this.activeIndex.set(0);
        this.loading.set(false);
      });

    queueMicrotask(() => this.queryInput?.nativeElement.focus());
  }

  onQueryChange(value: string): void {
    this.query.set(value);
    this.query$.next(value);
  }

  onKeydown(event: KeyboardEvent): void {
    const items = this.results();
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.min(i + 1, Math.max(items.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.update((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[this.activeIndex()];
      if (item) {
        this.select(item);
      }
    } else if (event.key === 'Escape') {
      this.dialogRef.close();
    }
  }

  select(item: CommandItem): void {
    void this.router.navigate([item.route], { queryParams: item.queryParams });
    this.dialogRef.close(item);
  }

  private defaultNav(filter = ''): CommandItem[] {
    const q = filter.trim().toLowerCase();
    const actions: CommandItem[] = [
      {
        id: 'action-agenda',
        kind: 'action',
        title: 'Agenda / reservas de hoy',
        subtitle: 'Operación del día',
        icon: 'event_available',
        route: '/app/reservations'
      },
      {
        id: 'action-inbox-unassigned',
        kind: 'action',
        title: 'Inbox sin asignar',
        subtitle: 'Seguimiento',
        icon: 'person_off',
        route: '/app/conversations',
        queryParams: { view: 'unassigned' }
      },
      {
        id: 'action-inbox-stale',
        kind: 'action',
        title: 'Conversaciones estancadas',
        subtitle: 'Seguimiento',
        icon: 'hourglass_top',
        route: '/app/conversations',
        queryParams: { view: 'stale' }
      },
      {
        id: 'action-reports',
        kind: 'action',
        title: 'Exportar reportes',
        subtitle: 'CSV y digest comercial',
        icon: 'download',
        route: '/app/reports'
      },
      {
        id: 'action-users',
        kind: 'action',
        title: 'Gestionar usuarios',
        subtitle: 'Equipo y roles',
        icon: 'group',
        route: '/app/users'
      },
      {
        id: 'action-analytics',
        kind: 'action',
        title: 'Analítica operativa',
        subtitle: 'Volumen, canales y carga',
        icon: 'monitoring',
        route: '/app/analytics'
      }
    ];
    const nav = NAV_ITEMS.map((n) => ({
      id: `nav-${n.route}`,
      kind: 'nav' as const,
      title: n.label,
      subtitle: 'Ir a módulo',
      icon: n.icon,
      route: n.route
    }));
    return [...actions, ...nav].filter(
      (i) => !q || i.title.toLowerCase().includes(q) || (i.subtitle ?? '').toLowerCase().includes(q)
    );
  }
}
