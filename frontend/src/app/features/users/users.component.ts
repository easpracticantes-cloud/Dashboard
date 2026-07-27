import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { UsersService } from '../../core/services/users.service';
import { OpsService } from '../../core/services/ops.service';
import { UserDto } from '../../core/models/user.model';
import { ROLE_LABELS, RoleCode } from '../../core/models/role.model';
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
    FormsModule,
    MatIconModule,
    MatMenuModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    PageHeaderComponent,
    EmptyStateComponent,
    AvatarComponent,
    TimeAgoPipe
  ],
  templateUrl: './users.component.html'
})
export class UsersComponent {
  private readonly usersService = inject(UsersService);
  private readonly ops = inject(OpsService);
  private readonly dialog = inject(MatDialog);
  private readonly auth = inject(AuthService);

  readonly loading = signal(true);
  readonly users = signal<UserDto[]>([]);
  readonly search = signal('');
  readonly roleFilter = signal<RoleCode | 'ALL'>('ALL');
  readonly statusFilter = signal<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');
  readonly togglingId = signal<string | null>(null);

  readonly roleLabels = ROLE_LABELS;
  readonly roleOptions = Object.keys(ROLE_LABELS) as RoleCode[];

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const role = this.roleFilter();
    const status = this.statusFilter();
    return this.users().filter((u) => {
      if (role !== 'ALL' && u.role !== role) return false;
      if (status === 'ACTIVE' && !u.active) return false;
      if (status === 'INACTIVE' && u.active) return false;
      if (!q) return true;
      const hay = `${u.fullName} ${u.username} ${u.email} ${u.role}`.toLowerCase();
      return hay.includes(q);
    });
  });

  readonly counts = computed(() => {
    const all = this.users();
    return {
      total: all.length,
      active: all.filter((u) => u.active).length,
      inactive: all.filter((u) => !u.active).length
    };
  });

  constructor() {
    this.fetch();
  }

  fetch(): void {
    this.loading.set(true);
    this.usersService.list().subscribe((users) => {
      this.users.set(users);
      this.loading.set(false);
    });
  }

  isSelf(user: UserDto): boolean {
    return this.auth.currentUser()?.id === user.id;
  }

  openCreate(): void {
    const ref = this.dialog.open(UserFormDialogComponent, { data: {}, panelClass: 'eas-dialog-panel' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      this.usersService.create(result).subscribe(() => this.fetch());
    });
  }

  openEdit(user: UserDto): void {
    const ref = this.dialog.open(UserFormDialogComponent, { data: { user }, panelClass: 'eas-dialog-panel' });
    ref.afterClosed().subscribe((result) => {
      if (!result) return;
      const { username, ...update } = result;
      this.usersService.update(user.id, update).subscribe(() => this.fetch());
    });
  }

  toggleActive(user: UserDto): void {
    if (this.isSelf(user)) return;
    this.togglingId.set(user.id);
    this.ops.setUserActive(user.id, !user.active).subscribe((ok) => {
      this.togglingId.set(null);
      if (ok) {
        this.fetch();
      }
    });
  }

  remove(user: UserDto): void {
    this.usersService.remove(user.id).subscribe(() => this.fetch());
  }
}
