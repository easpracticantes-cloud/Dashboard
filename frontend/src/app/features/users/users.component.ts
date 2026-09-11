import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { UsersService } from '../../core/services/users.service';
import { OpsService } from '../../core/services/ops.service';
import { UserDto } from '../../core/models/user.model';
import { ROLE_ACCESS, ROLE_DESCRIPTIONS, ROLE_LABELS, RoleCode } from '../../core/models/role.model';
import { AuthService } from '../../core/services/auth.service';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';
import { UserFormDialogComponent } from './user-form-dialog/user-form-dialog.component';

@Component({
  selector: 'eas-users',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatIconModule,
    PageHeaderComponent,
    EmptyStateComponent,
    AvatarComponent,
    TimeAgoPipe
  ],
  templateUrl: './users.component.html',
  styleUrl: './users.component.scss'
})
export class UsersComponent {
  private readonly usersService = inject(UsersService);
  private readonly ops = inject(OpsService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly users = signal<UserDto[]>([]);
  readonly search = signal('');
  readonly roleFilter = signal<RoleCode | 'ALL'>('ALL');
  readonly statusFilter = signal<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  readonly togglingId = signal<string | null>(null);
  readonly confirmUser = signal<UserDto | null>(null);
  readonly aviso = signal('');
  readonly avisoKind = signal<'ok' | 'err'>('ok');
  readonly selectedId = signal<string | null>(null);

  readonly roleLabels = ROLE_LABELS;
  readonly roleDescriptions = ROLE_DESCRIPTIONS;
  readonly roleAccess = ROLE_ACCESS;
  readonly roleOptions = Object.keys(ROLE_LABELS) as RoleCode[];

  readonly canDelete = computed(() => this.auth.hasAnyRole(['ADMINISTRADOR']));
  readonly canManage = computed(() => this.auth.hasAnyRole(['ADMINISTRADOR', 'GERENCIA', 'SUPERVISOR']));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    return this.users()
      .filter((u) => {
        if (role !== 'ALL' && u.role !== role) return false;
        if (status === 'ACTIVE' && !u.active) return false;
        if (status === 'INACTIVE' && u.active) return false;
        if (!q) return true;
        const hay = `${u.fullName} ${u.username} ${u.email} ${ROLE_LABELS[u.role]}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  });

  readonly counts = computed(() => {
    const all = this.users();
    const byRole = this.roleOptions.map((role) => ({
      role,
      label: ROLE_LABELS[role],
      count: all.filter((u) => u.role === role).length
    }));
    return {
      total: all.length,
      active: all.filter((u) => u.active).length,
      inactive: all.filter((u) => !u.active).length,
      byRole
    };
  });

  readonly selected = computed(() => {
    const id = this.selectedId();
    return this.filtered().find((u) => u.id === id) || this.filtered()[0] || null;
  });

  constructor() {
    this.fetch();
  }

  fetch(): void {
    this.loading.set(true);
    this.usersService.listTeam().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
        if (this.selectedId() && !users.some((u) => u.id === this.selectedId())) {
          this.selectedId.set(null);
        }
      },
      error: (err: Error) => {
        this.users.set([]);
        this.loading.set(false);
        this.flash(err.message, 'err');
      }
    });
  }

  isSelf(user: UserDto): boolean {
    return this.auth.currentUser()?.id === user.id;
  }

  select(user: UserDto): void {
    this.selectedId.set(user.id);
  }

  openCreate(): void {
    const ref = this.dialog.open(UserFormDialogComponent, {
      data: {},
      panelClass: 'eas-dialog-panel',
      width: 'min(92vw, 560px)'
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.saving.set(true);
      this.usersService.create(result).subscribe({
        next: (created) => {
          this.saving.set(false);
          this.flash(`Se creó ${created.fullName}.`, 'ok');
          this.selectedId.set(created.id);
          this.fetch();
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.flash(err.message, 'err');
        }
      });
    });
  }

  openEdit(user: UserDto): void {
    this.selectedId.set(user.id);
    const ref = this.dialog.open(UserFormDialogComponent, {
      data: { user },
      panelClass: 'eas-dialog-panel',
      width: 'min(92vw, 560px)'
    });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      const update = { ...result };
      delete update.username;
      this.saving.set(true);
      this.usersService.update(user.id, update).subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.flash(`Se actualizó ${updated.fullName}.`, 'ok');
          this.fetch();
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.flash(err.message, 'err');
        }
      });
    });
  }

  toggleActive(user: UserDto): void {
    if (this.isSelf(user)) {
      this.flash('No puedes desactivar tu propia cuenta.', 'err');
      return;
    }
    this.togglingId.set(user.id);
    this.ops.setUserActive(user.id, !user.active).subscribe((ok) => {
      this.togglingId.set(null);
      if (ok) {
        this.flash(user.active ? `${user.fullName} quedó inactivo.` : `${user.fullName} quedó activo.`, 'ok');
        this.fetch();
      } else {
        this.flash('No se pudo cambiar el estado.', 'err');
      }
    });
  }

  askRemove(user: UserDto): void {
    if (!this.canDelete()) {
      this.flash('Solo un administrador puede eliminar cuentas.', 'err');
      return;
    }
    if (this.isSelf(user)) {
      this.flash('No puedes eliminar tu propia cuenta.', 'err');
      return;
    }
    this.confirmUser.set(user);
  }

  confirmRemove(): void {
    const user = this.confirmUser();
    if (!user) return;
    this.saving.set(true);
    this.usersService.remove(user.id).subscribe({
      next: () => {
        this.saving.set(false);
        this.confirmUser.set(null);
        this.flash(`${user.fullName} se eliminó.`, 'ok');
        this.fetch();
      },
      error: (err: Error) => {
        this.saving.set(false);
        this.flash(err.message, 'err');
      }
    });
  }

  clearFilters(): void {
    this.search.set('');
    this.roleFilter.set('ALL');
    this.statusFilter.set('ALL');
  }

  private flash(message: string, kind: 'ok' | 'err'): void {
    this.aviso.set(message);
    this.avisoKind.set(kind);
  }
}
