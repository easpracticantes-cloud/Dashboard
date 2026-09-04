import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../../core/services/auth.service';
import { AppConfigService } from '../../../core/services/app-config.service';

/**
 * Descarga autenticada vía blob (window.open no envía JWT ni pasa por el interceptor).
 */
@Injectable({ providedIn: 'root' })
export class ContabilidadDownloadService {
  private readonly auth = inject(AuthService);
  private readonly config = inject(AppConfigService);

  /** Convierte rutas relativas Contabilidad a URL absoluta del BFF SIG. */
  resolveUrl(pathOrUrl: string): string {
    if (!pathOrUrl) {
      return '';
    }
    if (/^https?:\/\//i.test(pathOrUrl)) {
      return pathOrUrl;
    }
    let path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
    if (path.startsWith('/api/documents/')) {
      path = path.replace('/api/documents/', '/contabilidad/documents/');
    } else if (path.startsWith('/api/payments/')) {
      path = path.replace('/api/payments/', '/contabilidad/payments/');
    } else if (path.startsWith('/api/reports/')) {
      path = path.replace('/api/reports/', '/contabilidad/reports/');
    } else if (path.startsWith('/api/packages/')) {
      path = path.replace('/api/packages/', '/contabilidad/packages/');
    } else if (path.startsWith('/api/autobits/')) {
      path = path.replace('/api/autobits/', '/contabilidad/autobits/');
    } else if (path.startsWith('/api/cruce/')) {
      path = path.replace('/api/cruce/', '/contabilidad/cruce/');
    } else if (!path.startsWith('/contabilidad/') && !path.startsWith('/api/v1/contabilidad/')) {
      if (path.startsWith('/api/')) {
        path = path.replace('/api/', '/contabilidad/');
      } else {
        path = `/contabilidad${path}`;
      }
    }
    if (path.startsWith('/contabilidad/')) {
      return `${this.config.apiBaseUrl}${path}`;
    }
    return path.startsWith(this.config.apiBaseUrl) ? path : `${this.config.apiBaseUrl}${path}`;
  }

  async download(pathOrUrl: string, filenameHint?: string): Promise<void> {
    const url = this.resolveUrl(pathOrUrl);
    const token = this.auth.token();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      throw new Error(`No se pudo descargar (${res.status}).`);
    }
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8''|")?([^\";]+)/i.exec(cd);
    const name = filenameHint || (match ? decodeURIComponent(match[1]) : 'descarga');
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name.replace(/["']/g, '');
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  /** Carga un preview (imagen/PDF) como object URL autenticado. */
  async loadPreviewObjectUrl(pathOrUrl: string): Promise<string> {
    const url = this.resolveUrl(pathOrUrl);
    const token = this.auth.token();
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      throw new Error(`No se pudo cargar la vista previa (${res.status}).`);
    }
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }
}
