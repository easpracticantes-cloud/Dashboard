import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatIconModule } from '@angular/material/icon';
import {
  DocumentDetail,
  DocumentsApiService,
} from '../../services/documents-api.service';

@Component({
  selector: 'eas-contabilidad-document-detail',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatIconModule,
  ],
  templateUrl: './document-detail.component.html',
  styleUrl: './document-detail.component.scss',
})
export class DocumentDetailComponent implements OnInit {
  doc: DocumentDetail | null = null;
  cargando = true;
  error = '';
  procesando = false;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: DocumentsApiService
  ) {}

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.api.get(id).subscribe({
      next: (d) => {
        this.doc = d;
        this.cargando = false;
      },
      error: () => {
        this.error = 'Documento no encontrado.';
        this.cargando = false;
      },
    });
  }

  procesar(): void {
    if (!this.doc) return;
    this.procesando = true;
    this.error = '';
    this.api.process(this.doc.id).subscribe({
      next: (res) => {
        this.procesando = false;
        if (!res.ok) {
          this.error = res.error || 'Error al procesar.';
          return;
        }
        this.api.get(this.doc!.id).subscribe((d) => (this.doc = d));
      },
      error: (err) => {
        this.procesando = false;
        this.error = err?.error?.detail || err?.message || 'No se pudo procesar el documento.';
      },
    });
  }

  confidenceEntries(): [string, number][] {
    if (!this.doc?.confidence?.fields) return [];
    return Object.entries(this.doc.confidence.fields);
  }

  fieldSource(key: string): string {
    return this.doc?.confidence?.fields_detail?.[key]?.fuente || '';
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      PROCESADO: 'ok',
      EXTRAIDO: 'ok',
      APROBADO: 'ok',
      REQUIERE_REVISION: 'warn',
      DUPLICADO: 'warn',
      ERROR: 'bad',
      RECIBIDO: 'muted',
    };
    return map[estado] || 'muted';
  }
}
