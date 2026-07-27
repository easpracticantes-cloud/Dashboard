import { Injectable, signal, computed } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'eas-theme';
const SWITCH_MS = 420;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly mode = signal<ThemeMode>(this.readInitial());
  private switchingTimer: ReturnType<typeof setTimeout> | null = null;

  readonly theme = this.mode.asReadonly();
  readonly isDark = computed(() => this.mode() === 'dark');
  /** Icono a mostrar: luna en modo claro (para pasar a oscuro), sol en modo oscuro. */
  readonly toggleIcon = computed(() => (this.isDark() ? 'light_mode' : 'dark_mode'));
  readonly toggleLabel = computed(() => (this.isDark() ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'));

  constructor() {
    this.apply(this.mode(), false);
  }

  toggle(): void {
    this.set(this.mode() === 'dark' ? 'light' : 'dark');
  }

  set(theme: ThemeMode): void {
    if (theme === this.mode()) {
      return;
    }

    const root = document.documentElement;
    const applyNow = () => {
      this.mode.set(theme);
      this.apply(theme, true);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* ignore */
      }
    };

    if (this.switchingTimer) {
      clearTimeout(this.switchingTimer);
      this.switchingTimer = null;
    }

    // Marca el swap: evita transicionar transform/layout (eso causa el “salto”).
    root.classList.add('theme-switching');

    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => { finished: Promise<void> };
    };

    const finish = () => {
      // Deja pintar el tema nuevo y luego re-habilita transiciones suaves de color.
      this.switchingTimer = setTimeout(() => {
        requestAnimationFrame(() => {
          root.classList.remove('theme-switching');
          this.switchingTimer = null;
        });
      }, SWITCH_MS);
    };

    if (typeof doc.startViewTransition === 'function') {
      try {
        const transition = doc.startViewTransition(() => applyNow());
        void transition.finished.finally(finish);
        return;
      } catch {
        /* fallback abajo */
      }
    }

    applyNow();
    finish();
  }

  private readInitial(): ThemeMode {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'dark' || stored === 'light') {
        return stored;
      }
    } catch {
      /* ignore */
    }
    return 'light';
  }

  private apply(theme: ThemeMode, animateMeta: boolean): void {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    if (animateMeta) {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) {
        meta.setAttribute('content', theme === 'dark' ? '#0c1210' : '#14261C');
      }
    }
  }
}
