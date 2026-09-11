/** Día de calendario del Excel, sin pasar por Date/UTC. */

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

export function sheetCalendarDate(raw?: string | null): string {
  const d = parseSheetDate(raw);
  return d || '';
}

/** Fecha de contacto: si es diciembre de este año y aún no es diciembre, es del año pasado. */
export function sheetContactFecha(raw?: string | null, today = localToday()): string {
  const iso = parseSheetDate(raw);
  if (!iso) return (raw || '').trim();
  const [y, m] = iso.split('-').map(Number);
  if (y === today.year && m === 12 && today.month < 12) {
    return `${y - 1}-${iso.slice(5)}`;
  }
  return iso;
}

export function formatSheetDate(raw?: string | null): string {
  const iso = parseSheetDate(raw);
  if (!iso) {
    const t = (raw || '').trim();
    return t || '—';
  }
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function formatContactFecha(raw?: string | null): string {
  return formatSheetDate(sheetContactFecha(raw));
}

export function sheetDateKey(raw?: string | null): string {
  return sheetContactFecha(raw) || '';
}

function localToday(): { year: number; month: number; day: number } {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() + 1, day: n.getDate() };
}

function parseSheetDate(raw?: string | null): string {
  const v = (raw || '').trim();
  if (!v) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    return v.slice(0, 10);
  }
  if (/^\d{4,6}(\.\d+)?$/.test(v)) {
    const n = Number(v);
    if (n > 20000 && n < 80000) {
      const ms = SERIAL_EPOCH + Math.round(n) * 86400000;
      const dt = new Date(ms);
      return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
    }
  }
  const dm = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (dm) {
    let a = Number(dm[1]);
    let b = Number(dm[2]);
    let y = dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3]);
    let month = b;
    let day = a;
    if (a > 12 && b <= 12) {
      day = a;
      month = b;
    } else if (b > 12 && a <= 12) {
      month = a;
      day = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${pad(month)}-${pad(day)}`;
    }
  }
  return '';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
