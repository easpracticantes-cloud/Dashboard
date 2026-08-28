import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  DigitalPackage,
  PackagesApiService,
  StorageStatus,
} from '../../services/packages-api.service';

@Component({
  selector: 'eas-contabilidad-packages',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule],
  templateUrl: './packages.component.html',
  styleUrl: './packages.component.scss',
})
export class PackagesComponent implements OnInit {
  paquetes: DigitalPackage[] = [];
  total = 0;
  cargando = true;
  error = '';
  storageInfo: StorageStatus | null = null;

  filtroEstado = '';
  documentIdNuevo = '';

  estados = ['', 'PENDIENTE', 'GENERADO', 'ENTREGADO', 'DIGITALIZADO', 'CERRADO'];

  constructor(private readonly api: PackagesApiService) {}

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

  descargar(p: DigitalPackage): void {
    window.open(this.api.downloadUrl(p.id), '_blank');
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'warn',
      GENERADO: 'muted',
      ENTREGADO: 'ok',
      DIGITALIZADO: 'ok',
      CERRADO: 'ok',
    };
    return map[estado] || 'muted';
  }
}
