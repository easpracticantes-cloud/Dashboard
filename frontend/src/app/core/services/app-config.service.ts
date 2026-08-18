import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

export interface RuntimeConfig {
  apiBaseUrl?: string;
  googleClientId?: string;
}

/**
 * Configuración runtime (public/runtime-config.json) para apuntar el front
 * desplegado al backend de Render sin recompilar.
 */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private loaded = false;
  private apiBase = environment.apiBaseUrl;
  private googleId = environment.googleClientId ?? '';

  get apiBaseUrl(): string {
    return this.apiBase.replace(/\/$/, '');
  }

  get googleClientId(): string {
    return this.googleId;
  }

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    this.loaded = true;
    try {
      const res = await fetch('runtime-config.json', { cache: 'no-store' });
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as RuntimeConfig;
      if (json.apiBaseUrl?.trim()) {
        this.apiBase = json.apiBaseUrl.trim().replace(/\/$/, '');
      }
      if (json.googleClientId?.trim()) {
        this.googleId = json.googleClientId.trim();
      }
    } catch {
      // keep environment defaults
    }
  }
}
