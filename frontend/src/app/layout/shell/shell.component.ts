import { Component, inject, HostListener } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { CommandPaletteComponent } from '../../shared/components/command-palette/command-palette.component';
import { AveCopilotComponent } from '../../shared/components/ave-copilot/ave-copilot.component';

@Component({
  selector: 'eas-shell',
  standalone: true,
  imports: [RouterOutlet, MatSidenavModule, MatDialogModule, SidebarComponent, TopbarComponent, AveCopilotComponent],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        #drawer
        class="shell__drawer"
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="!isMobile()"
        [fixedInViewport]="isMobile()"
      >
        <eas-sidebar (navigate)="isMobile() && drawer.close()"></eas-sidebar>
      </mat-sidenav>

      <mat-sidenav-content class="shell__content">
        <eas-topbar (menuToggle)="drawer.toggle()" (openCommand)="openCommandPalette()"></eas-topbar>
        <main class="shell__main">
          <div class="shell__canvas">
            <router-outlet></router-outlet>
          </div>
        </main>
        <eas-ave-copilot />
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }

      .shell {
        height: 100vh;
        width: 100%;
        max-width: 100%;
        overflow: hidden;
        background:
          radial-gradient(ellipse 80% 50% at 0% -5%, rgba(228, 160, 26, 0.28), transparent 50%),
          radial-gradient(ellipse 70% 55% at 100% 5%, rgba(31, 122, 76, 0.22), transparent 48%),
          radial-gradient(ellipse 55% 40% at 50% 110%, rgba(61, 154, 106, 0.18), transparent 55%),
          linear-gradient(165deg, #d5e4db 0%, #e8f0eb 40%, #dfeae3 100%);
      }

      .shell__drawer {
        width: var(--eas-sidebar-w) !important;
        border: none !important;
        background: transparent !important;
      }

      .shell__content {
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 100vh;
        min-width: 0 !important;
        max-width: 100%;
        overflow-x: clip;
        overflow-y: auto;
        background: transparent;
        box-sizing: border-box;
      }

      .shell__main {
        flex: 1 1 auto;
        min-width: 0;
        max-width: 100%;
        width: 100%;
        padding: 1.45rem 1.35rem 3rem;
        box-sizing: border-box;
      }

      @media (min-width: 768px) {
        .shell__main {
          padding: 1.5rem 1.85rem 3rem;
        }
      }

      .shell__canvas {
        width: 100%;
        max-width: min(1480px, 100%);
        min-width: 0;
        margin: 0 auto;
        box-sizing: border-box;
        animation: eas-rise-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      .shell__canvas > *:not(router-outlet) {
        display: block;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }
    `
  ]
})
export class ShellComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly liveSync = inject(LiveSyncService);
  private readonly dialog = inject(MatDialog);
  private commandOpen = false;

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 1023px)').pipe(map((state) => state.matches)),
    { initialValue: false }
  );

  constructor() {
    this.liveSync.start();
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const isK = event.key.toLowerCase() === 'k';
    if ((event.ctrlKey || event.metaKey) && isK) {
      event.preventDefault();
      this.openCommandPalette();
    }
  }

  openCommandPalette(): void {
    if (this.commandOpen) {
      return;
    }
    this.commandOpen = true;
    const ref = this.dialog.open(CommandPaletteComponent, {
      panelClass: 'eas-command-palette-panel',
      backdropClass: 'eas-command-palette-backdrop',
      autoFocus: false,
      width: 'auto',
      maxWidth: '95vw'
    });
    ref.afterClosed().subscribe(() => {
      this.commandOpen = false;
    });
  }
}
