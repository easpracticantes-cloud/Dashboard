import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AppConfigService } from './app-config.service';

export interface WhatsappFieldValue {
  valor?: string | null;
  estado?: string;
  confianza?: number;
}

export interface WhatsappUltimaCotizacion {
  fecha?: string | null;
  servicio?: string | null;
  valor?: string | null;
  estado?: string | null;
  condiciones?: string | null;
  respuestaCliente?: string | null;
}

export interface WhatsappCoincidencia {
  cliente?: string;
  celular?: string;
  fecha?: string;
  hojaOrigen?: string;
  fechaCotizado?: string;
  pendiente?: string;
  motivo?: string;
}

export interface WhatsappPreview {
  previewId: string;
  filename: string;
  messageCount: number;
  campos: Record<string, WhatsappFieldValue>;
  ultimaCotizacion?: WhatsappUltimaCotizacion | null;
  historialCotizaciones?: WhatsappUltimaCotizacion[];
  resumen?: string | null;
  posibleDuplicado?: string | null;
  coincidencias?: WhatsappCoincidencia[];
  requiereConfirmacion: boolean;
}

@Injectable({ providedIn: 'root' })
export class WhatsappRegistroApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  analyze(file: File): Observable<WhatsappPreview> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<WhatsappPreview>(`${this.config.apiBaseUrl}/registro/whatsapp/analyze`, form);
  }

  confirm(previewId: string, row: Record<string, unknown>, updateExisting: boolean): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${this.config.apiBaseUrl}/registro/whatsapp/confirm`, {
      previewId,
      updateExisting,
      row,
    });
  }

  cancel(previewId: string): Observable<void> {
    return this.http.post<void>(`${this.config.apiBaseUrl}/registro/whatsapp/${previewId}/cancel`, {});
  }
}
