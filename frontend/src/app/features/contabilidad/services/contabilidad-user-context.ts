import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';

/** Usuario SIG actual para auditoría (el proxy también envía X-SIG-Username). */
@Injectable({ providedIn: 'root' })
export class ContabilidadUserContext {
  private readonly auth = inject(AuthService);

  username(): string {
    const u = this.auth.currentUser();
    return (u?.username || u?.correo || 'SISTEMA').trim() || 'SISTEMA';
  }

  /** Payload parcial con usuario real — reemplaza ANDREA hardcodeado. */
  withUsuario<T extends Record<string, unknown>>(extra: T = {} as T): T & { usuario: string } {
    return { ...extra, usuario: this.username() };
  }
}
