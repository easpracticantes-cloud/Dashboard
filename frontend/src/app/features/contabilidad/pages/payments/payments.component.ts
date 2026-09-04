import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { PaymentSummary, PaymentsApiService } from '../../services/payments-api.service';
import { ContabilidadDownloadService } from '../../services/contabilidad-download.service';
import { formatCop, iconEstado, labelEstado, toneEstado } from '../../utils/contabilidad-labels';

/** Estados desde los que el backend exige motivo reforzado (≥10 caracteres). */
const ESTADOS_MOTIVO_REFORZADO = new Set([
  'PAGADO',
  'COMPROBANTE_PENDIENTE',
  'COMPLETADO',
]);

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
  private readonly api = inject(PaymentsApiService);
  private readonly download = inject(ContabilidadDownloadService);

  pagos: PaymentSummary[] = [];
  total = 0;
  cargando = true;
  error = '';
  subiendo = false;
  exportando = false;
  accionEnCurso: number | null = null;

  filtroEstado = '';
  filtroBusqueda = '';
  crossingIdNuevo = '';

  estados = [
    '',
    'PENDIENTE_APROBACION',
    'APROBADO',
    'PENDIENTE_PAGO',
    'PAGADO',
    'COMPROBANTE_PENDIENTE',
    'COMPLETADO',
    'ANULADO',
  ];

  readonly formatCop = formatCop;
  readonly labelEstado = labelEstado;
  readonly toneEstado = toneEstado;
  readonly iconEstado = iconEstado;

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
      { label: 'Anulados', val: count(['ANULADO']), cls: 'bad' },
    ];
  }

  get totalValor(): number {
    return this.pagos
      .filter((p) => p.estado !== 'ANULADO')
      .reduce((sum, p) => sum + (p.valor || 0), 0);
  }

  puedeAnular(p: PaymentSummary): boolean {
    return !!p?.estado && p.estado !== 'ANULADO';
  }

  puedeAjustar(p: PaymentSummary): boolean {
    return !!p?.estado && p.estado !== 'ANULADO';
  }

  puedeAprobar(p: PaymentSummary): boolean {
    return p.estado === 'PENDIENTE_APROBACION';
  }

  puedeMarcarPagado(p: PaymentSummary): boolean {
    return p.estado === 'PENDIENTE_PAGO';
  }

  puedeCompletar(p: PaymentSummary): boolean {
    return (
      !!p.has_receipt &&
      (p.estado === 'PAGADO' || p.estado === 'COMPROBANTE_PENDIENTE')
    );
  }

  puedeSubirComprobante(p: PaymentSummary): boolean {
    return (
      p.estado === 'PAGADO' ||
      p.estado === 'COMPROBANTE_PENDIENTE' ||
      p.estado === 'PENDIENTE_PAGO'
    );
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
        error: (err) => {
          this.error = this.msgError(err, 'No se pudieron cargar los pagos.');
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
    if (!confirm(`¿Crear pago desde el cruce #${id}?`)) {
      return;
    }
    this.error = '';
    this.api.createFromCrossing(id).subscribe({
      next: () => {
        this.crossingIdNuevo = '';
        this.cargar();
      },
      error: (err) => {
        this.error = this.msgError(err, 'No se pudo crear el pago.');
      },
    });
  }

  aprobar(p: PaymentSummary): void {
    if (!this.puedeAprobar(p)) {
      return;
    }
    const msg =
      `¿Aprobar el pago a ${p.proveedor || 'proveedor'}` +
      (p.valor != null ? ` por ${formatCop(p.valor)}` : '') +
      '?';
    if (!confirm(msg)) {
      return;
    }
    this.error = '';
    this.accionEnCurso = p.id;
    this.api.approve(p.id).subscribe({
      next: () => {
        this.accionEnCurso = null;
        this.cargar();
      },
      error: (err) => {
        this.accionEnCurso = null;
        this.error = this.msgError(err, 'Error al aprobar pago.');
      },
    });
  }

  marcarPagado(p: PaymentSummary): void {
    if (!this.puedeMarcarPagado(p)) {
      return;
    }
    if (
      !confirm(
        '¿Confirmar que la transferencia bancaria ya fue ejecutada en Bancolombia? ' +
          'Esta acción indica pago confirmado en banco.'
      )
    ) {
      return;
    }
    const obs = prompt('Observaciones del pago manual (opcional):') || undefined;
    this.error = '';
    this.accionEnCurso = p.id;
    this.api.markPaid(p.id, obs).subscribe({
      next: () => {
        this.accionEnCurso = null;
        this.cargar();
      },
      error: (err) => {
        this.accionEnCurso = null;
        this.error = this.msgError(err, 'Error al marcar como pagado.');
      },
    });
  }

  completar(p: PaymentSummary): void {
    if (!this.puedeCompletar(p)) {
      return;
    }
    if (
      !confirm(
        `¿Completar el pago #${p.id}? Requiere comprobante cargado y confirma el cierre operativo del pago.`
      )
    ) {
      return;
    }
    this.error = '';
    this.accionEnCurso = p.id;
    this.api.complete(p.id).subscribe({
      next: () => {
        this.accionEnCurso = null;
        this.cargar();
      },
      error: (err) => {
        this.accionEnCurso = null;
        this.error = this.msgError(err, 'No se pudo completar el pago.');
      },
    });
  }

  anular(p: PaymentSummary): void {
    if (!this.puedeAnular(p)) {
      return;
    }
    const minLen = ESTADOS_MOTIVO_REFORZADO.has(p.estado) ? 10 : 1;
    const avisoBanco = ESTADOS_MOTIVO_REFORZADO.has(p.estado)
      ? '\n\nEste pago ya figura como ejecutado en banco: el motivo debe ser detallado (mín. 10 caracteres).'
      : '';
    if (
      !confirm(
        `¿Anular el pago #${p.id} a ${p.proveedor || 'proveedor'}` +
          (p.valor != null ? ` (${formatCop(p.valor)})` : '') +
          '?\n\nEl registro no se elimina: queda en estado Anulado con auditoría.' +
          avisoBanco
      )
    ) {
      return;
    }
    const motivo = (prompt('Motivo de la anulación (obligatorio):') || '').trim();
    if (!motivo) {
      this.error = 'Debe indicar el motivo de la anulación.';
      return;
    }
    if (motivo.length < minLen) {
      this.error = `El motivo debe tener al menos ${minLen} caracteres.`;
      return;
    }
    this.error = '';
    this.accionEnCurso = p.id;
    this.api.annul(p.id, motivo).subscribe({
      next: () => {
        this.accionEnCurso = null;
        this.cargar();
      },
      error: (err) => {
        this.accionEnCurso = null;
        this.error = this.msgError(err, 'No se pudo anular el pago.');
      },
    });
  }

  ajustarValor(p: PaymentSummary): void {
    if (!this.puedeAjustar(p)) {
      return;
    }
    const raw = prompt(
      `Nuevo valor en COP (actual: ${formatCop(p.valor)}). Solo números:`,
      p.valor != null ? String(Math.round(Number(p.valor))) : ''
    );
    if (raw === null) {
      return;
    }
    const digits = String(raw).replace(/[^\d]/g, '');
    const valor = Number(digits);
    if (!Number.isFinite(valor) || valor <= 0) {
      this.error = 'Indique un valor numérico mayor que cero.';
      return;
    }
    const motivo = (prompt('Motivo del ajuste de valor (obligatorio):') || '').trim();
    if (!motivo) {
      this.error = 'Debe indicar el motivo del ajuste.';
      return;
    }
    if (
      !confirm(
        `¿Ajustar el valor del pago #${p.id} de ${formatCop(p.valor)} a ${formatCop(valor)}?\nMotivo: ${motivo}`
      )
    ) {
      return;
    }
    this.error = '';
    this.accionEnCurso = p.id;
    this.api.adjust(p.id, valor, motivo).subscribe({
      next: () => {
        this.accionEnCurso = null;
        this.cargar();
      },
      error: (err) => {
        this.accionEnCurso = null;
        this.error = this.msgError(err, 'No se pudo ajustar el valor.');
      },
    });
  }

  onReceiptSelected(p: PaymentSummary, event: Event): void {
    if (!this.puedeSubirComprobante(p)) {
      return;
    }
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.subiendo = true;
    this.error = '';
    const contramarcado = confirm('¿Comprobante contramarcado?');
    this.api.uploadReceipt(p.id, file, contramarcado).subscribe({
      next: () => {
        this.subiendo = false;
        input.value = '';
        this.cargar();
      },
      error: (err) => {
        this.subiendo = false;
        this.error = this.msgError(err, 'Error al subir comprobante.');
      },
    });
  }

  async exportarPendientes(): Promise<void> {
    this.exportando = true;
    this.error = '';
    try {
      await this.download.download(this.api.exportPendingUrl(), 'pagos-pendientes.csv');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo descargar el reporte.';
    } finally {
      this.exportando = false;
    }
  }

  /** Extrae mensaje FastAPI/Spring sin asumir éxito. */
  private msgError(err: unknown, fallback: string): string {
    const e = err as {
      status?: number;
      error?: { detail?: unknown; message?: string };
      message?: string;
    };
    const detail = e?.error?.detail;
    if (typeof detail === 'string' && detail.trim()) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const parts = detail
        .map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: string }).msg) : String(d)))
        .filter(Boolean);
      if (parts.length) {
        return parts.join(' · ');
      }
    }
    if (typeof e?.error?.message === 'string' && e.error.message.trim()) {
      return e.error.message;
    }
    if (e?.status === 403) {
      return 'No tiene permiso para esta acción.';
    }
    if (e?.status === 409) {
      return typeof detail === 'string' ? detail : 'Operación no permitida (período cerrado o conflicto).';
    }
    return fallback;
  }
}
