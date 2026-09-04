/** Etiquetas humanas para estados del módulo Contabilidad AP. */

const DOCUMENT: Record<string, string> = {
  RECIBIDO: 'Recibido',
  PROCESANDO: 'Procesando',
  EXTRAIDO: 'Extraído',
  VALIDANDO: 'Validando',
  CRUZANDO: 'En cruce',
  APROBADO: 'Aprobado',
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGADO: 'Pagado (banco)',
  COMPROBANTE_RECIBIDO: 'Comprobante recibido',
  AUTOBITS_PENDIENTE: 'Pendiente Autobits',
  AUTOBITS_ACTUALIZADO: 'Autobits actualizado',
  PAQUETE_DIGITAL: 'Paquete digital',
  ENTREGADO: 'Entregado',
  FINALIZADO: 'Finalizado',
  ERROR: 'Error',
  REQUIERE_REVISION: 'Requiere revisión',
  SUBSANACION: 'En subsanación',
  DUPLICADO: 'Posible duplicado',
  PROCESADO: 'Procesado',
  ANULADO: 'Anulado'
};

const CROSSING: Record<string, string> = {
  PENDIENTE: 'Pendiente (falta factura/CDC)',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado (listo para pago)',
  SUBSANACION: 'Subsanación',
  PAGADO: 'Pagado (banco confirmado)',
  ARCHIVADO: 'Archivado'
};

const PAYMENT: Record<string, string> = {
  PENDIENTE_APROBACION: 'Pendiente de aprobación',
  APROBADO: 'Aprobado',
  PENDIENTE_PAGO: 'Generado — por confirmar en banco',
  PAGADO: 'Pagado (banco confirmado)',
  COMPROBANTE_PENDIENTE: 'Pagado — falta comprobante',
  COMPLETADO: 'Completado',
  ANULADO: 'Anulado'
};

const REMEDIATION: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  EN_PROCESO: 'En proceso',
  CORREGIDO: 'Corregido',
  CERRADO: 'Cerrado'
};

const PACKAGE: Record<string, string> = {
  PENDIENTE: 'Pendiente',
  GENERADO: 'Generado',
  ENTREGADO: 'Entregado',
  DIGITALIZADO: 'Digitalizado',
  CERRADO: 'Cerrado'
};

export type ContabilidadEstadoKind =
  | 'document'
  | 'crossing'
  | 'payment'
  | 'remediation'
  | 'package'
  | 'auto';

export function labelEstado(estado: string | null | undefined, kind: ContabilidadEstadoKind = 'auto'): string {
  if (!estado) {
    return '—';
  }
  const key = estado.toUpperCase();
  if (kind === 'document') return DOCUMENT[key] || humanize(key);
  if (kind === 'crossing') return CROSSING[key] || humanize(key);
  if (kind === 'payment') return PAYMENT[key] || humanize(key);
  if (kind === 'remediation') return REMEDIATION[key] || humanize(key);
  if (kind === 'package') return PACKAGE[key] || humanize(key);
  return (
    PAYMENT[key] ||
    CROSSING[key] ||
    DOCUMENT[key] ||
    REMEDIATION[key] ||
    PACKAGE[key] ||
    humanize(key)
  );
}

/** Tone for chips: ok | final | warn | bad | void | muted | info */
export function toneEstado(
  estado: string | null | undefined
): 'ok' | 'final' | 'warn' | 'bad' | 'void' | 'muted' | 'info' {
  const key = (estado || '').toUpperCase();
  if (key === 'ANULADO') {
    return 'void';
  }
  if (['PAGADO', 'COMPLETADO', 'FINALIZADO', 'ENTREGADO'].includes(key)) {
    return 'final';
  }
  if (['APROBADO', 'CORREGIDO', 'CERRADO', 'GENERADO', 'DIGITALIZADO', 'IMPORTADO'].includes(key)) {
    return 'ok';
  }
  if (['ERROR', 'DUPLICADO', 'SUBSANACION'].includes(key)) {
    return 'bad';
  }
  if (
    [
      'PENDIENTE',
      'PENDIENTE_PAGO',
      'PENDIENTE_APROBACION',
      'COMPROBANTE_PENDIENTE',
      'EN_REVISION',
      'REQUIERE_REVISION',
      'EN_PROCESO',
      'LISTO_PARA_ACTUALIZAR'
    ].includes(key)
  ) {
    return 'warn';
  }
  if (['ARCHIVADO', 'PROCESADO'].includes(key)) {
    return 'muted';
  }
  return 'info';
}

/** Material icon name for estado chips (visual only). */
export function iconEstado(estado: string | null | undefined): string {
  const key = (estado || '').toUpperCase();
  if (key === 'ANULADO') return 'block';
  if (['PAGADO', 'COMPLETADO'].includes(key)) return 'verified';
  if (key === 'APROBADO') return 'task_alt';
  if (key.includes('PENDIENTE') || key === 'EN_REVISION' || key === 'REQUIERE_REVISION') {
    return 'schedule';
  }
  if (key === 'SUBSANACION' || key === 'ERROR' || key === 'DUPLICADO') return 'error';
  if (key === 'COMPROBANTE_PENDIENTE') return 'attach_file';
  return 'label';
}

function humanize(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function formatCop(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  const n = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (Number.isNaN(n)) {
    return '—';
  }
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0
  }).format(Math.round(n));
}

export function formatFechaContable(value: string | Date | null | undefined): string {
  if (!value) {
    return '—';
  }
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) {
    // ISO date-only YYYY-MM-DD
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [y, m, day] = value.slice(0, 10).split('-');
      return `${day}/${m}/${y}`;
    }
    return String(value);
  }
  return new Intl.DateTimeFormat('es-CO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}
