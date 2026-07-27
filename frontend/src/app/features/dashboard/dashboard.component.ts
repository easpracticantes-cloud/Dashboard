import { Component, computed, inject, ViewEncapsulation, DestroyRef, effect, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval, startWith } from 'rxjs';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/services/auth.service';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { DashboardSheetsComponent } from './dashboard-sheets/dashboard-sheets.component';
import { CommandCenterComponent } from './command-center/command-center.component';

@Component({
  selector: 'eas-dashboard',
  standalone: true,
  imports: [DatePipe, RouterLink, MatIconModule, DashboardSheetsComponent, CommandCenterComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  encapsulation: ViewEncapsulation.None
})
export class DashboardComponent {
  private readonly auth = inject(AuthService);
  private readonly liveSync = inject(LiveSyncService);
  private readonly destroyRef = inject(DestroyRef);

  readonly now = signal(new Date());
  readonly syncing = this.liveSync.syncing;
  readonly firstName = computed(() => this.auth.currentUser()?.nombre?.split(' ')[0] ?? '');

  constructor() {
    effect(() => {
      this.liveSync.tick();
    });

    interval(60_000)
      .pipe(startWith(0), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.now.set(new Date()));
  }
}
