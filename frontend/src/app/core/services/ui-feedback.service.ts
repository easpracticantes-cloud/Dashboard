import { Injectable, signal } from '@angular/core';

export type UiFeedbackKind = 'success' | 'error' | 'info' | 'confirm';

export interface UiFeedbackState {
  kind: UiFeedbackKind;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

@Injectable({ providedIn: 'root' })
export class UiFeedbackService {
  private readonly state = signal<UiFeedbackState | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private confirmResolver: ((ok: boolean) => void) | null = null;

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

  /** Reemplazo de window.confirm / confirm(): modal centrado. */
  confirm(
    message: string,
    options?: { title?: string; confirmLabel?: string; cancelLabel?: string }
  ): Promise<boolean> {
    this.clearTimer();
    if (this.confirmResolver) {
      this.confirmResolver(false);
      this.confirmResolver = null;
    }
    const text = String(message || '').trim();
    if (!text) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      this.confirmResolver = resolve;
      this.state.set({
        kind: 'confirm',
        title: options?.title || 'Confirmar',
        message: text,
        confirmLabel: options?.confirmLabel || 'Aceptar',
        cancelLabel: options?.cancelLabel || 'Cancelar',
      });
    });
  }

  acceptConfirm(): void {
    const resolve = this.confirmResolver;
    this.confirmResolver = null;
    this.state.set(null);
    resolve?.(true);
  }

  dismissConfirm(): void {
    const resolve = this.confirmResolver;
    this.confirmResolver = null;
    this.state.set(null);
    resolve?.(false);
  }

  clear(): void {
    this.clearTimer();
    if (this.confirmResolver) {
      this.confirmResolver(false);
      this.confirmResolver = null;
    }
    this.state.set(null);
  }

  private show(kind: UiFeedbackKind, title: string, message: string, autoMs: number): void {
    const text = String(message || '').trim();
    if (!text) {
      return;
    }
    this.clearTimer();
    if (this.confirmResolver) {
      this.confirmResolver(false);
      this.confirmResolver = null;
    }
    this.state.set({ kind, title, message: text });
    if (autoMs > 0) {
      this.timer = setTimeout(() => this.clear(), autoMs);
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
