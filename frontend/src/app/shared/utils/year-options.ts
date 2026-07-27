/** Primer año con datos reales del workbook CRM (ENE–FEB–MAR 2025). */
export const CRM_START_YEAR = 2025;

/**
 * Años del filtro CRM: desde el inicio del workbook hasta el año actual
 * (incluye +1 si hay fechas de servicio futuras en el año siguiente).
 */
export function buildYearOptions(
  startYear = CRM_START_YEAR,
  endYear = Math.max(new Date().getFullYear(), CRM_START_YEAR) + 1
): number[] {
  const from = Math.min(startYear, endYear);
  const to = Math.max(startYear, endYear);
  const years: number[] = [];
  for (let y = to; y >= from; y -= 1) {
    years.push(y);
  }
  return years;
}

/** Año calendario de un ISO/Instant sin desfases por zona horaria. */
export function calendarYear(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^(\d{4})/.exec(iso.trim());
  if (m) return Number(m[1]);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/** Mes calendario 1–12 de un ISO/Instant. */
export function calendarMonth(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^\d{4}-(\d{2})/.exec(iso.trim());
  if (m) return Number(m[1]);
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getUTCMonth() + 1;
}
