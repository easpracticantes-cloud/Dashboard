import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  DocumentSummary,
  DocumentsApiService,
} from '../../services/documents-api.service';

@Component({
  selector: 'eas-contabilidad-documents-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './documents-list.component.html',
  styleUrl: './documents-list.component.scss',
})
export class DocumentsListComponent implements OnInit {
  documentos: DocumentSummary[] = [];
  total = 0;
  cargando = true;
  error = '';
  filtroEstado = '';
  filtroBusqueda = '';
  subiendo = false;

  estados = [
    '',
    'RECIBIDO',
    'EXTRAIDO',
    'PROCESADO',
    'REQUIERE_REVISION',
    'DUPLICADO',
    'APROBADO',
    'ERROR',
  ];

  constructor(
    private readonly api: DocumentsApiService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    this.api
      .list({
        limit: 100,
        estado: this.filtroEstado || undefined,
        search: this.filtroBusqueda || undefined,
      })
      .subscribe({
        next: (res) => {
          this.documentos = res.items;
          this.total = res.total;
          this.cargando = false;
        },
        error: () => {
          this.error = 'No se pudieron cargar los documentos.';
          this.cargando = false;
        },
      });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.subiendo = true;
    this.error = '';
    this.api.upload(file).subscribe({
      next: (res) => {
        this.subiendo = false;
        input.value = '';
        if (res.duplicate_warning) {
          alert(`Advertencia: ${res.duplicate_warning}`);
        }
        if (res.process_error) {
          alert(`Documento guardado, pero el OCR/IA falló: ${res.process_error}`);
        }
        this.router.navigate(['/app/contabilidad/documentos', res.document.id]);
      },
      error: () => {
        this.subiendo = false;
        this.error = 'Error al subir el archivo.';
      },
    });
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
