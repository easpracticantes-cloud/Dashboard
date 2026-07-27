import {
  MonthlyPoint,
  NamedCount,
  SeguimientoWhatsapp,
  SheetsFilters,
  SheetsKpis
} from '../../../core/models/sheets-dashboard.model';

export function emptyFilters(): SheetsFilters {
  return { year: '', month: '', canal: '', semaforo: '', cliente: '', hoja: '' };
}

export function filterSeguimientos(rows: SeguimientoWhatsapp[], filters: SheetsFilters): SeguimientoWhatsapp[] {
  const year = filters.year.trim();
  const month = filters.month.trim().padStart(2, '0');
  const canal = filters.canal.trim().toUpperCase();
  const semaforo = filters.semaforo.trim().toUpperCase();
  const cliente = filters.cliente.trim().toLowerCase();
  const hoja = filters.hoja.trim();

  return rows.filter((row) => {
    const fecha = (row.fecha || '').slice(0, 10);
    if (year && !fecha.startsWith(year)) return false;
    if (month && month !== '00' && fecha.length >= 7 && fecha.slice(5, 7) !== month) return false;
    if (canal && (row.canal || '').toUpperCase() !== canal) return false;
    if (semaforo && (row.semaforo || '').toUpperCase() !== semaforo) return false;
    if (hoja && (row.hojaOrigen || '') !== hoja) return false;
    if (cliente) {
      const hay = `${row.cliente || ''} ${row.celular || ''} ${row.solicitud || ''} ${row.notas || ''}`.toLowerCase();
      if (!hay.includes(cliente)) return false;
    }
    return true;
  });
}

export function computeKpis(rows: SeguimientoWhatsapp[]): SheetsKpis {
  const totalContactos = rows.length;
  const totalVentas = rows.filter((r) => (r.semaforo || '').toUpperCase() === 'VENTA').length;
  const totalConEncuesta = rows.filter((r) => r.encuesta).length;
  const totalTibioCaliente = rows.filter((r) => {
    const s = (r.semaforo || '').toUpperCase();
    return s.includes('TIBIO') || s.includes('CALIENTE');
  }).length;
  const tasaConversion = totalContactos > 0 ? Math.round((totalVentas * 10000) / totalContactos) / 100 : 0;
  return { totalContactos, totalVentas, tasaConversion, totalConEncuesta, totalTibioCaliente };
}

export function aggregateBy(rows: SeguimientoWhatsapp[], keyFn: (r: SeguimientoWhatsapp) => string): NamedCount[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = (keyFn(row) || 'SIN_DATO').trim() || 'SIN_DATO';
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

export function buildEvolucion(rows: SeguimientoWhatsapp[]): MonthlyPoint[] {
  const map = new Map<string, { seguimientos: number; ventas: number }>();
  for (const row of rows) {
    const mes = monthKey(row.fecha);
    if (!mes) continue;
    const entry = map.get(mes) ?? { seguimientos: 0, ventas: 0 };
    entry.seguimientos += 1;
    if ((row.semaforo || '').toUpperCase() === 'VENTA') {
      entry.ventas += 1;
    }
    map.set(mes, entry);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({ mes, seguimientos: v.seguimientos, ventas: v.ventas }));
}

export function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => (v || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'es')
  );
}

function monthKey(fecha: string | null | undefined): string | null {
  if (!fecha) return null;
  const d = fecha.slice(0, 10);
  if (d.length >= 7 && d.charAt(4) === '-') {
    return d.slice(0, 7);
  }
  return null;
}
