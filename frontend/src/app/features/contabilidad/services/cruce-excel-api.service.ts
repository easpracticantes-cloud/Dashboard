import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface CruceBatchInfo {
  id: number;
  filename: string;
  period_start?: string | null;
  period_end?: string | null;
  imported_rows: number;
  imported_at: string;
}

export interface PendienteItem {
  tipo: string;
  titulo: string;
  detalle: string;
  crossing_id?: number | null;
  proveedor?: string | null;
  numero_compra?: string | null;
  numero_reserva?: string | null;
  valor?: number | null;
  origen: string;
  hoja?: string | null;
  fila?: number | null;
  celda?: string | null;
  lado_autobits?: Record<string, unknown>;
  lado_excel?: Record<string, unknown>;
  copiar?: string;
}

export interface PendientesResumen {
  tipo: string;
  etiqueta: string;
  cantidad: number;
}

export interface PendientesData {
  total: number;
  por_tipo: Record<string, PendienteItem[]>;
  resumen: PendientesResumen[];
  valor_pendiente: number;
  ultimo_cruce?: {
    archivo?: string;
    aplicado?: boolean;
    timestamp?: string;
  };
}

export interface PendientesResponse {
  has_autobits: boolean;
  batch: CruceBatchInfo | null;
  pendientes: PendientesData;
  comparacion?: ComparacionFila[];
  ultimo_cruce?: {
    archivo?: string;
    aplicado?: boolean;
    timestamp?: string;
    sobrantes?: number;
  } | null;
}

export interface ConflictoCruce {
  crossing_id: number;
  campo: string;
  en_sistema: string;
  en_excel: string;
  proveedor?: string | null;
  numero_compra?: string | null;
}

export interface ComparacionFila {
  crossing_id?: number | null;
  proveedor?: string | null;
  lado_autobits: Record<string, unknown>;
  lado_excel: Record<string, unknown>;
  faltas: string[];
  accion?: string;
  copiar: string;
}

export interface CruceUploadResult {
  aplicado: boolean;
  archivo: string;
  batch: CruceBatchInfo;
  lectura: {
    filas_leidas: number;
    filas_duplicadas: number;
    hojas: { nombre: string; filas: number }[];
    avisos: string[];
  };
  conciliacion: {
    emparejadas: number;
    sin_correspondencia: number;
    fuera_de_periodo: number;
    sin_fecha: number;
    actualizadas: number;
    conflictos: ConflictoCruce[];
  };
  comparacion?: ComparacionFila[];
  pendientes: PendientesData;
}

@Injectable({ providedIn: 'root' })
export class CruceExcelApiService {
  private readonly base = '/contabilidad/cruce-excel';

  constructor(private readonly http: HttpClient) {}

  upload(file: File, aplicar = true): Observable<CruceUploadResult> {
    const form = new FormData();
    form.append('archivo', file, file.name);
    form.append('aplicar', aplicar ? 'true' : 'false');
    return this.http.post<CruceUploadResult>(`${this.base}/upload`, form);
  }

  getPendientes(batchId?: number): Observable<PendientesResponse> {
    const q = batchId ? `?batch_id=${batchId}` : '';
    return this.http.get<PendientesResponse>(`${this.base}/pendientes${q}`);
  }

  exportUrl(batchId?: number): string {
    const q = batchId ? `?batch_id=${batchId}` : '';
    return `${this.base}/pendientes/export${q}`;
  }
}
