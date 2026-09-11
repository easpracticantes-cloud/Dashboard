import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concatMap, from, map, of, reduce } from 'rxjs';
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

export interface WhatsappAnalyzeError {
  filename?: string;
  message: string;
}

export interface WhatsappAnalyzeResult {
  total: number;
  ok: number;
  failed: number;
  items: WhatsappPreview[];
  errors: WhatsappAnalyzeError[];
  requiereConfirmacion: boolean;
}

export interface WhatsappConfirmBatchItem {
  previewId: string;
  row: Record<string, unknown>;
  updateExisting: boolean;
}

export interface WhatsappConfirmBatchResult {
  ok: number;
  failed: number;
  errors: { previewId?: string; message?: string }[];
  message: string;
}

const ANALYZE_CHUNK = 8;
const CONFIRM_CHUNK = 10;

@Injectable({ providedIn: 'root' })
export class WhatsappRegistroApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  analyze(files: File | File[]): Observable<WhatsappAnalyzeResult> {
    const list = (Array.isArray(files) ? files : [files]).filter(Boolean);
    const chunks: File[][] = [];
    for (let i = 0; i < list.length; i += ANALYZE_CHUNK) {
      chunks.push(list.slice(i, i + ANALYZE_CHUNK));
    }
    const empty: WhatsappAnalyzeResult = {
      total: 0,
      ok: 0,
      failed: 0,
      items: [],
      errors: [],
      requiereConfirmacion: true,
    };
    return from(chunks).pipe(
      concatMap((chunk) =>
        this.analyzeChunk(chunk).pipe(
          catchError((err) =>
            of({
              total: 0,
              ok: 0,
              failed: chunk.length,
              items: [],
              errors: [
                {
                  message:
                    err?.error?.message ||
                    err?.error?.detail ||
                    'No se pudo analizar este lote.',
                },
              ],
              requiereConfirmacion: true,
            } satisfies WhatsappAnalyzeResult)
          )
        )
      ),
      reduce(
        (acc, cur) => ({
          total: acc.total + (cur.total || 0),
          ok: acc.ok + (cur.ok || 0),
          failed: acc.failed + (cur.failed || 0),
          items: [...acc.items, ...(cur.items || [])],
          errors: [...acc.errors, ...(cur.errors || [])],
          requiereConfirmacion: true,
        }),
        empty
      )
    );
  }

  confirm(previewId: string, row: Record<string, unknown>, updateExisting: boolean): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(`${this.config.apiBaseUrl}/registro/whatsapp/confirm`, {
      previewId,
      updateExisting,
      row,
    });
  }

  confirmBatch(items: WhatsappConfirmBatchItem[]): Observable<WhatsappConfirmBatchResult> {
    const chunks: WhatsappConfirmBatchItem[][] = [];
    for (let i = 0; i < items.length; i += CONFIRM_CHUNK) {
      chunks.push(items.slice(i, i + CONFIRM_CHUNK));
    }
    const empty: WhatsappConfirmBatchResult = { ok: 0, failed: 0, errors: [], message: '' };
    return from(chunks).pipe(
      concatMap((chunk) =>
        this.http.post<WhatsappConfirmBatchResult>(
          `${this.config.apiBaseUrl}/registro/whatsapp/confirm-batch`,
          { items: chunk }
        )
      ),
      reduce(
        (acc, cur) => ({
          ok: acc.ok + (cur.ok || 0),
          failed: acc.failed + (cur.failed || 0),
          errors: [...acc.errors, ...(cur.errors || [])],
          message: cur.message || acc.message,
        }),
        empty
      ),
      map((res) => ({
        ...res,
        message:
          res.message ||
          `${res.ok} fila(s) escritas en el Excel` +
            (res.failed ? ` · ${res.failed} con error.` : '.'),
      }))
    );
  }

  cancel(previewId: string): Observable<void> {
    return this.http.post<void>(`${this.config.apiBaseUrl}/registro/whatsapp/${previewId}/cancel`, {});
  }

  private analyzeChunk(files: File[]): Observable<WhatsappAnalyzeResult> {
    const form = new FormData();
    for (const file of files) {
      form.append('files', file, file.name);
    }
    return this.http
      .post<WhatsappAnalyzeResult>(`${this.config.apiBaseUrl}/registro/whatsapp/analyze`, form)
      .pipe(
        map((res) => {
          const items =
            res.items?.length
              ? res.items
              : res && (res as unknown as WhatsappPreview).previewId
                ? [res as unknown as WhatsappPreview]
                : [];
          return {
            total: res.total ?? items.length,
            ok: res.ok ?? items.length,
            failed: res.failed ?? (res.errors?.length || 0),
            items,
            errors: res.errors || [],
            requiereConfirmacion: true,
          };
        })
      );
  }
}
