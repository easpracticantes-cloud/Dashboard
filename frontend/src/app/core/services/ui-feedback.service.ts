import { Injectable, signal } from '@angular/core';

export type UiFeedbackKind = 'success' | 'error' | 'info';

export interface UiFeedbackState {
  kind: UiFeedbackKind;
  title: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  private readonly state = signal<UiFeedbackState | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  readonly current = this.state.asReadonly();

  success(message: string, title = 'Listo'): void {
    this.show('success', title, message, 2800);
  }

  error(message: string, title = 'Atención'): void {
    this.show('error', title, message, 0);
  }

  info(message: string, title = 'Información'): void {
    this.show('info', title, message, 3200);
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.set(null);
  }

  private show(kind: UiFeedbackKind, title: string, message: string, autoMs: number): void {
    const text = String(message || '').trim();
    if (!text) {
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.set({ kind, title, message: text });
    if (autoMs > 0) {
      this.timer = setTimeout(() => this.clear(), autoMs);
    }
  }
}
