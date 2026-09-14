import { Component, HostListener, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SidebarComponent } from './sidebar/sidebar.component';
import { TopbarComponent } from './topbar/topbar.component';
import { LiveSyncService } from '../../core/services/live-sync.service';
import { CommandPaletteComponent } from '../../shared/components/command-palette/command-palette.component';
import { AveCopilotComponent } from '../../shared/components/ave-copilot/ave-copilot.component';

const SIDEBAR_PREF_KEY = 'eas-sidebar-open';

@Component({
  selector: 'eas-shell',
  standalone: true,
  imports: [RouterOutlet, MatSidenavModule, MatDialogModule, SidebarComponent, TopbarComponent, AveCopilotComponent],
  template: `
    <mat-sidenav-container class="shell">
      <mat-sidenav
        class="shell__drawer"
        [mode]="isMobile() ? 'over' : 'side'"
        [opened]="sidebarOpen()"
        [fixedInViewport]="isMobile()"
        (openedChange)="onDrawerOpenedChange($event)"
      >
        <eas-sidebar (navigate)="onSidebarNavigate()"></eas-sidebar>
      </mat-sidenav>

      <mat-sidenav-content class="shell__content">
        @if (!sidebarOpen() && !isMobile()) {
          <button
            type="button"
            class="shell__edge"
            (click)="toggleSidebar()"
            aria-label="Mostrar menú lateral"
            title="Mostrar menú lateral (tecla [)"
          >
            <span class="shell__edge-label">Menú</span>
          </button>
        }
        <eas-topbar
          [sidebarOpen]="sidebarOpen()"
          (menuToggle)="toggleSidebar()"
          (openCommand)="openCommandPalette()"
        ></eas-topbar>
        <main class="shell__main">
          <div class="shell__canvas" [attr.data-nav]="navTick()">
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
        height: 100dvh;
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
        position: relative;
        display: flex;
        flex-direction: column;
        height: 100%;
        max-height: 100vh;
        max-height: 100dvh;
        min-width: 0 !important;
        width: auto;
        overflow-x: hidden;
        overflow-y: auto;
        touch-action: pan-y;
        background: transparent;
        box-sizing: border-box;
        scroll-behavior: smooth;
      }

      .shell__edge {
        position: fixed;
        left: 0;
        top: 42%;
        z-index: 40;
        width: 28px;
        min-height: 96px;
        padding: 0.9rem 0;
        border: 1px solid rgba(31, 122, 76, 0.22);
        border-left: none;
        border-radius: 0 12px 12px 0;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.94), rgba(232, 240, 235, 0.96));
        color: var(--eas-forest, #1f7a4c);
        box-shadow: 4px 6px 18px rgba(20, 38, 28, 0.08);
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .shell__edge:hover {
        width: 32px;
        background: rgba(31, 122, 76, 0.1);
        border-color: rgba(31, 122, 76, 0.4);
      }

      .shell__edge-label {
        writing-mode: sideways-lr;
        font-size: 0.68rem;
        font-weight: 750;
        letter-spacing: 0.14em;
        text-transform: uppercase;
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
      }

      .shell__canvas[data-nav] {
        animation: eas-page-enter 0.38s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      @keyframes eas-page-enter {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .shell__canvas > *:not(router-outlet) {
        display: block;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }

      @media (prefers-reduced-motion: reduce) {
        .shell__content {
          scroll-behavior: auto;
        }

        .shell__canvas[data-nav] {
          animation: none;
        }
      }

      html[data-theme='dark'] .shell__edge {
        background: linear-gradient(180deg, rgba(28, 40, 34, 0.96), rgba(22, 32, 27, 0.98));
        border-color: rgba(61, 154, 106, 0.35);
        color: #8fd4ad;
        box-shadow: 4px 8px 22px rgba(0, 0, 0, 0.28);
      }
    `,
  ],
})
export class ShellComponent {
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly liveSync = inject(LiveSyncService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private commandOpen = false;
  private skippingOpenedSync = false;

  readonly navTick = signal(0);
  readonly sidebarOpen = signal(true);

  readonly isMobile = toSignal(
    this.breakpointObserver.observe('(max-width: 1023px)').pipe(map((state) => state.matches)),
    {
      initialValue:
        typeof window !== 'undefined' ? window.matchMedia('(max-width: 1023px)').matches : false,
    },
  );

  constructor() {
    this.liveSync.start();

    effect(() => {
      const mobile = this.isMobile();
      this.skippingOpenedSync = true;
      if (mobile) {
        this.sidebarOpen.set(false);
      } else {
        this.sidebarOpen.set(this.readSidebarPref());
      }
      queueMicrotask(() => {
        this.skippingOpenedSync = false;
      });
    });

    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.navTick.update((n) => n + 1);
        const content = document.querySelector('.shell__content') as HTMLElement | null;
        content?.scrollTo({ top: 0, behavior: 'smooth' });
      });
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((open) => !open);
    this.persistSidebarPref();
  }

  onDrawerOpenedChange(opened: boolean): void {
    if (this.skippingOpenedSync) {
      return;
    }
    this.sidebarOpen.set(opened);
    this.persistSidebarPref();
  }

  onSidebarNavigate(): void {
    if (this.isMobile()) {
      this.sidebarOpen.set(false);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onGlobalKeydown(event: KeyboardEvent): void {
    const isK = event.key.toLowerCase() === 'k';
    if ((event.ctrlKey || event.metaKey) && isK) {
      event.preventDefault();
      this.openCommandPalette();
    }
    if (event.key === '[' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const t = event.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || t?.isContentEditable) {
        return;
      }
      event.preventDefault();
      this.toggleSidebar();
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
      maxWidth: '95vw',
    });
    ref.afterClosed().subscribe(() => {
      this.commandOpen = false;
    });
  }

  private readSidebarPref(): boolean {
    try {
      const stored = localStorage.getItem(SIDEBAR_PREF_KEY);
      if (stored === '0' || stored === 'false') {
        return false;
      }
      if (stored === '1' || stored === 'true') {
        return true;
      }
    } catch {
      /* ignore */
    }
    return true;
  }

  private persistSidebarPref(): void {
    if (this.isMobile()) {
      return;
    }
    try {
      localStorage.setItem(SIDEBAR_PREF_KEY, this.sidebarOpen() ? '1' : '0');
    } catch {
      /* ignore */
    }
  }
}
