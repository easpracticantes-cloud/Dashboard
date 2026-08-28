import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PaymentSummary, PaymentsApiService } from '../../services/payments-api.service';

@Component({
  selector: 'eas-contabilidad-payments',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.scss',
})
export class PaymentsComponent implements OnInit {
  pagos: PaymentSummary[] = [];
  total = 0;
  cargando = true;
  error = '';
  subiendo = false;

  filtroEstado = '';
  filtroBusqueda = '';
  crossingIdNuevo = '';

  estados = [
    '',
    'PENDIENTE_APROBACION',
    'PENDIENTE_PAGO',
    'PAGADO',
    'COMPROBANTE_PENDIENTE',
    'COMPLETADO',
  ];

  constructor(private readonly api: PaymentsApiService) {}

  ngOnInit(): void {
    this.cargar();
  }

  get resumen(): { label: string; val: number; cls: string }[] {
    const count = (estados: string[]) =>
      this.pagos.filter((p) => estados.includes(p.estado)).length;
    return [
      { label: 'Por aprobar', val: count(['PENDIENTE_APROBACION']), cls: 'warn' },
      { label: 'Por pagar', val: count(['PENDIENTE_PAGO', 'APROBADO']), cls: 'warn' },
      { label: 'Pagados', val: count(['PAGADO', 'COMPROBANTE_PENDIENTE']), cls: '' },
      { label: 'Completados', val: count(['COMPLETADO']), cls: 'ok' },
    ];
  }

  get totalValor(): number {
    return this.pagos.reduce((sum, p) => sum + (p.valor || 0), 0);
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
          this.pagos = res.items;
          this.total = res.total;
          this.cargando = false;
        },
        error: () => {
          this.error = 'No se pudieron cargar los pagos.';
          this.cargando = false;
        },
      });
  }

  crearDesdeCruce(): void {
    const id = Number(this.crossingIdNuevo);
    if (!id) {
      this.error = 'Indique el ID del cruce aprobado.';
      return;
    }
    this.api.createFromCrossing(id).subscribe({
      next: () => {
        this.crossingIdNuevo = '';
        this.cargar();
      },
      error: (err) => {
        this.error = err?.error?.detail || 'No se pudo crear el pago.';
      },
    });
  }

  aprobar(p: PaymentSummary): void {
    this.api.approve(p.id).subscribe({
      next: () => this.cargar(),
      error: () => {
        this.error = 'Error al aprobar pago.';
      },
    });
  }

  marcarPagado(p: PaymentSummary): void {
    const obs = prompt('Observaciones del pago manual (opcional):') || undefined;
    this.api.markPaid(p.id, obs).subscribe({
      next: () => this.cargar(),
      error: () => {
        this.error = 'Error al marcar como pagado.';
      },
    });
  }

  onReceiptSelected(p: PaymentSummary, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.subiendo = true;
    const contramarcado = confirm('¿Comprobante contramarcado?');
    this.api.uploadReceipt(p.id, file, contramarcado).subscribe({
      next: () => {
        this.subiendo = false;
        input.value = '';
        this.cargar();
      },
      error: () => {
        this.subiendo = false;
        this.error = 'Error al subir comprobante.';
      },
    });
  }

  exportarPendientes(): void {
    window.open(this.api.exportPendingUrl(), '_blank');
  }

  estadoClass(estado: string): string {
    const map: Record<string, string> = {
      PENDIENTE_APROBACION: 'warn',
      PENDIENTE_PAGO: 'warn',
      PAGADO: 'muted',
      COMPROBANTE_PENDIENTE: 'warn',
      COMPLETADO: 'ok',
      APROBADO: 'muted',
    };
    return map[estado] || 'muted';
  }
}
