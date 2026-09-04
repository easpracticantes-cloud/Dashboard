import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  DigitalPackage,
  PackagesApiService,
  StorageStatus,
} from '../../services/packages-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import {
  formatFechaContable,
  iconEstado,
  labelEstado,
  toneEstado,
} from '../../utils/contabilidad-labels';

@Component({
  selector: 'eas-contabilidad-packages',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss',
})
export class PackagesComponent implements OnInit {
  private readonly api = inject(PackagesApiService);
  private readonly download = inject(ContabilidadDownloadService);

  paquetes: DigitalPackage[] = [];
  total = 0;
  cargando = true;
  error = '';
  storageInfo: StorageStatus | null = null;

  filtroEstado = '';
  documentIdNuevo = '';

  readonly formatFechaContable = formatFechaContable;
  readonly labelEstado = labelEstado;
  readonly toneEstado = toneEstado;
  readonly iconEstado = iconEstado;

  estados = ['', 'PENDIENTE', 'GENERADO', 'ENTREGADO', 'DIGITALIZADO', 'CERRADO'];

  ngOnInit(): void {
    this.api.storageStatus().subscribe({
      next: (s) => {
        this.storageInfo = s;
        this.cargar();
      },
      error: () => this.cargar(),
    });
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    this.api
      .list({ limit: 100, estado: this.filtroEstado || undefined })
      .subscribe({
        next: (res) => {
          this.paquetes = res.items;
          this.total = res.total;
          this.cargando = false;
        },
        error: () => {
          this.error = 'No se pudieron cargar los paquetes.';
          this.cargando = false;
        },
      });
  }

  crearPaquete(): void {
    const docId = Number(this.documentIdNuevo);
    if (!docId) {
      this.error = 'Indique el ID del documento.';
      return;
    }
    this.api.create({ document_id: docId }).subscribe({
      next: () => {
        this.documentIdNuevo = '';
        this.cargar();
      },
      error: (err) => {
        this.error = err?.error?.detail || 'No se pudo crear el paquete.';
      },
    });
  }

  generar(p: DigitalPackage): void {
    this.api.generate(p.id).subscribe({
      next: () => this.cargar(),
      error: () => {
        this.error = 'Error al generar el ZIP.';
      },
    });
  }

  entregar(p: DigitalPackage): void {
    this.api.updateEstado(p.id, 'ENTREGADO', 'Entregado a Katherine').subscribe({
      next: () => this.cargar(),
      error: () => {
        this.error = 'Error al marcar entregado.';
      },
    });
  }

  cerrar(p: DigitalPackage): void {
    this.api.updateEstado(p.id, 'CERRADO').subscribe({
      next: () => this.cargar(),
      error: () => {
        this.error = 'Error al cerrar paquete.';
      },
    });
  }

  async descargar(p: DigitalPackage): Promise<void> {
    this.error = '';
    try {
      await this.download.download(this.api.downloadUrl(p.id), `paquete-${p.id}.zip`);
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo descargar el paquete.';
    }
  }
}
