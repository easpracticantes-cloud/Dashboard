import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import {
  FacturasApiService,
  HealthResponse,
  ResultadoFactura,
} from '../../services/facturas-api.service';

interface ArchivoLocal {
  file: File;
  previewUrl: string;
}

@Component({
  selector: 'eas-contabilidad-processing',
  standalone: true,
  imports: [CommonModule, FormsModule, MatProgressBarModule, MatProgressSpinnerModule, MatIconModule],
  templateUrl: './processing.component.html',
  styleUrl: './processing.component.scss',
})
export class ProcessingComponent implements OnInit, OnDestroy {
  archivos: ArchivoLocal[] = [];
  seleccionIndex = 0;
  solicitud =
    'Extrae número de factura, proveedor, fecha de emisión, subtotal, impuesto, total y moneda.';
  procesando = false;
  estado = 'Listo para analizar facturas.';
  resultados: ResultadoFactura[] = [];
  errorGlobal = '';
  health: HealthResponse | null = null;
  arrastrando = false;
  progreso = 0;

  constructor(private readonly api: FacturasApiService) {}

  ngOnInit(): void {
    this.api.health().subscribe({
      next: (h) => {
        this.health = h;
        if (!h.ok) {
          this.estado = h.errores.join(' ');
        }
      },
      error: () => {
        this.estado =
          'No se pudo conectar con la API. Abre la app con el acceso directo o inicia el servidor.';
      },
    });
  }

  ngOnDestroy(): void {
    this.limpiarPreviews();
  }

  get archivoActivo(): ArchivoLocal | null {
    return this.archivos[this.seleccionIndex] ?? null;
  }

  get resultadoActivo(): ResultadoFactura | null {
    if (!this.resultados.length) {
      return null;
    }
    const nombre = this.archivoActivo?.file.name;
    return (
      this.resultados.find((r) => r.archivo === nombre) ??
      this.resultados[0] ??
      null
    );
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando = true;
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando = false;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.arrastrando = false;
    const files = event.dataTransfer?.files;
    if (files?.length) {
      this.agregarArchivos(Array.from(files));
    }
  }

  onFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files?.length) {
      this.agregarArchivos(Array.from(input.files));
      input.value = '';
    }
  }

  agregarArchivos(files: File[]): void {
    const validos = files.filter((f) =>
      /\.(jpg|jpeg|png)$/i.test(f.name)
    );
    for (const file of validos) {
      if (this.archivos.some((a) => a.file.name === file.name && a.file.size === file.size)) {
        continue;
      }
      this.archivos.push({
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (this.archivos.length) {
      this.seleccionIndex = this.archivos.length - 1;
      this.estado = `${this.archivos.length} factura(s) lista(s).`;
    }
  }

  seleccionar(index: number): void {
    this.seleccionIndex = index;
  }

  quitar(index: number, event?: Event): void {
    event?.stopPropagation();
    const [removed] = this.archivos.splice(index, 1);
    if (removed) {
      URL.revokeObjectURL(removed.previewUrl);
    }
    if (this.seleccionIndex >= this.archivos.length) {
      this.seleccionIndex = Math.max(0, this.archivos.length - 1);
    }
    this.estado = this.archivos.length
      ? `${this.archivos.length} factura(s) lista(s).`
      : 'Lista vacía.';
  }

  limpiar(): void {
    this.limpiarPreviews();
    this.archivos = [];
    this.resultados = [];
    this.errorGlobal = '';
    this.seleccionIndex = 0;
    this.progreso = 0;
    this.estado = 'Lista vacía.';
  }

  procesar(): void {
    if (this.procesando) {
      return;
    }
    if (!this.archivos.length) {
      this.errorGlobal = 'Agrega al menos una factura.';
      return;
    }
    const texto = this.solicitud.trim();
    if (!texto) {
      this.errorGlobal = 'Escribe qué quieres que analice la IA.';
      return;
    }

    this.procesando = true;
    this.errorGlobal = '';
    this.resultados = [];
    this.progreso = 12;
    this.estado = 'Procesando con OCR + IA local...';

    const timer = window.setInterval(() => {
      if (this.progreso < 88) {
        this.progreso += 4;
      }
    }, 450);

    this.api.procesar(
      this.archivos.map((a) => a.file),
      texto
    ).subscribe({
      next: (res) => {
        window.clearInterval(timer);
        this.progreso = 100;
        this.procesando = false;
        if (!res.ok) {
          this.errorGlobal = res.error || 'Error al procesar.';
          this.estado = 'Error en el procesamiento.';
          return;
        }
        this.resultados = res.resultados || [];
        const ok = this.resultados.filter((r) => r.ok).length;
        const fail = this.resultados.length - ok;
        this.estado = `Listo: ${ok} correcta(s), ${fail} con error.`;
      },
      error: (err) => {
        window.clearInterval(timer);
        this.procesando = false;
        this.progreso = 0;
        this.errorGlobal =
          err?.error?.detail ||
          err?.message ||
          'No se pudo completar la solicitud.';
        this.estado = 'Error de conexión con la API.';
      },
    });
  }

  private limpiarPreviews(): void {
    for (const a of this.archivos) {
      URL.revokeObjectURL(a.previewUrl);
    }
  }
}
