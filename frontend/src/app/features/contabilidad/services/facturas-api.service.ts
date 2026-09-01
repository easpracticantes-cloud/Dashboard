import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface HealthResponse {
  ok: boolean;
  errores: string[];
  tesseract: boolean;
  /** Motor IA disponible (Gemini u Ollama). Compat: se llama ollama. */
  ollama: boolean;
  ai?: boolean;
  ai_provider?: string;
  ai_model?: string;
  ai_key_configured?: boolean;
  vision_fallback?: boolean;
  gemini?: boolean;
  hint?: string | null;
}

export interface ResultadoFactura {
  archivo: string;
  ok: boolean;
  metodo_ocr: string;
  caracteres_ocr: number;
  respuesta_ia: string;
  error: string;
  ruta_respuesta: string;
  preview_url?: string;
}

export interface ProcesarResponse {
  ok: boolean;
  resultados: ResultadoFactura[];
  error: string;
}

@Injectable({ providedIn: 'root' })
export class FacturasApiService {
  private readonly base = '/api';

  constructor(private readonly http: HttpClient) {}

  health(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.base}/health`);
  }

  procesar(archivos: File[], solicitud: string): Observable<ProcesarResponse> {
    const form = new FormData();
    form.append('solicitud', solicitud);
    for (const archivo of archivos) {
      form.append('archivos', archivo, archivo.name);
    }
    return this.http.post<ProcesarResponse>(`${this.base}/procesar`, form);
  }
}
