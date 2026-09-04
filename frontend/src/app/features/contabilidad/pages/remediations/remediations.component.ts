import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import {
  RemediationSummary,
  RemediationsApiService,
} from '../../services/remediations-api.service';
import { ContabilidadUserContext } from '../../services/contabilidad-user-context';
import { formatCop, labelEstado } from '../../utils/contabilidad-labels';

@Component({
  selector: 'eas-contabilidad-remediations',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule],
  templateUrl: './remediations.component.html',
  styleUrl: './remediations.component.scss',
})
export class RemediationsComponent implements OnInit {
  private readonly api = inject(RemediationsApiService);
  private readonly userCtx = inject(ContabilidadUserContext);

  items: RemediationSummary[] = [];
  total = 0;
  cargando = true;
  error = '';
  guardando = false;

  filtroEstado = '';
  filtroTipo = '';
  filtroBusqueda = '';

  readonly formatCop = formatCop;
  readonly labelEstado = labelEstado;

  tipos: { key: string; label: string }[] = [];
  estados: string[] = [];

  mostrarFormulario = false;
  editando: RemediationSummary | null = null;

  form = {
    document_id: '',
    tipo_problema: 'OTRO',
    descripcion: '',
    proveedor: '',
    valor_involucrado: '',
    responsable: '',
    fecha_limite: '',
    observaciones: '',
  };

  ngOnInit(): void {
    this.api.catalog().subscribe({
      next: (cat) => {
        this.tipos = cat.types;
        this.estados = cat.statuses;
        this.cargar();
      },
      error: () => {
        this.error = 'No se pudo cargar el catálogo.';
        this.cargando = false;
      },
    });
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';
    this.api
      .list({
        limit: 100,
        estado: this.filtroEstado || undefined,
        tipo_problema: this.filtroTipo || undefined,
        search: this.filtroBusqueda || undefined,
      })
      .subscribe({
        next: (res) => {
          this.items = res.items;
          this.total = res.total;
          this.cargando = false;
        },
        error: () => {
          this.error = 'No se pudieron cargar las subsanaciones.';
          this.cargando = false;
        },
      });
  }

  abrirNueva(): void {
    this.mostrarFormulario = true;
    this.editando = null;
    this.form = {
      document_id: '',
      tipo_problema: 'OTRO',
      descripcion: '',
      proveedor: '',
      valor_involucrado: '',
      responsable: this.userCtx.username(),
      fecha_limite: '',
      observaciones: '',
    };
  }

  abrirEditar(item: RemediationSummary): void {
    this.mostrarFormulario = true;
    this.editando = item;
    this.form = {
      document_id: String(item.document_id),
      tipo_problema: item.tipo_problema,
      descripcion: item.descripcion,
      proveedor: item.proveedor || '',
      valor_involucrado: item.valor_involucrado != null ? String(item.valor_involucrado) : '',
      responsable: item.responsable || this.userCtx.username(),
      fecha_limite: item.fecha_limite || '',
      observaciones: item.observaciones || '',
    };
  }

  cancelarFormulario(): void {
    this.mostrarFormulario = false;
    this.editando = null;
  }

  guardar(): void {
    this.guardando = true;
    this.error = '';

    if (this.editando) {
      this.api
        .update(this.editando.id, {
          tipo_problema: this.form.tipo_problema,
          descripcion: this.form.descripcion,
          proveedor: this.form.proveedor || undefined,
          valor_involucrado: this.form.valor_involucrado
            ? Number(this.form.valor_involucrado)
            : undefined,
          responsable: this.form.responsable || undefined,
          fecha_limite: this.form.fecha_limite || undefined,
          observaciones: this.form.observaciones || undefined,
        })
        .subscribe({
          next: () => {
            this.guardando = false;
            this.cancelarFormulario();
            this.cargar();
          },
          error: () => {
            this.guardando = false;
            this.error = 'Error al guardar la subsanación.';
          },
        });
      return;
    }

    const docId = Number(this.form.document_id);
    if (!docId) {
      this.guardando = false;
      this.error = 'Indique el ID del documento.';
      return;
    }

    this.api
      .create({
        document_id: docId,
        tipo_problema: this.form.tipo_problema,
        descripcion: this.form.descripcion,
        proveedor: this.form.proveedor || undefined,
        valor_involucrado: this.form.valor_involucrado
          ? Number(this.form.valor_involucrado)
          : undefined,
        responsable: this.form.responsable || undefined,
        fecha_limite: this.form.fecha_limite || undefined,
        observaciones: this.form.observaciones || undefined,
      })
      .subscribe({
        next: () => {
          this.guardando = false;
          this.cancelarFormulario();
          this.cargar();
        },
        error: () => {
          this.guardando = false;
          this.error = 'Error al crear la subsanación.';
        },
      });
  }

  cambiarEstado(item: RemediationSummary, estado: string): void {
    this.api.updateEstado(item.id, estado).subscribe({
      next: () => this.cargar(),
      error: () => {
        this.error = 'No se pudo cambiar el estado.';
      },
    });
  }

  eliminar(item: RemediationSummary): void {
    if (!confirm(`¿Eliminar subsanación #${item.id}?`)) return;
    this.api.delete(item.id).subscribe({
      next: () => this.cargar(),
      error: () => {
        this.error = 'No se pudo eliminar.';
      },
    });
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE: 'warn',
      EN_PROCESO: 'muted',
      CORREGIDO: 'ok',
      CERRADO: 'ok',
    };
    return map[estado] || 'muted';
  }
}
