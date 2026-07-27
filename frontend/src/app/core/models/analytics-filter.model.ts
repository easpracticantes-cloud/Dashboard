export interface AnalyticsFilter {
  year?: number | null;
  month?: number | null;
  importance?: string | null;
  status?: string | null;
  category?: string | null;
  advisorId?: string | null;
  name?: string | null;
  phone?: string | null;
  search?: string | null;
  from?: string | null;
  to?: string | null;
}

export function emptyAnalyticsFilter(): AnalyticsFilter {
  return {
    year: null,
    month: null,
    importance: null,
    status: null,
    category: null,
    advisorId: null,
    name: null,
    phone: null,
    search: null,
    from: null,
    to: null
  };
}

export function analyticsFilterToParams(filter: AnalyticsFilter): Record<string, string | number | boolean | undefined> {
  return {
    year: filter.year ?? undefined,
    month: filter.month ?? undefined,
    importance: filter.importance || undefined,
    status: filter.status || undefined,
    category: filter.category || undefined,
    advisorId: filter.advisorId || undefined,
    name: filter.name || undefined,
    phone: filter.phone || undefined,
    search: filter.search || undefined,
    from: filter.from || undefined,
    to: filter.to || undefined
  };
}

export function hasActiveAnalyticsFilters(filter: AnalyticsFilter): boolean {
  return Object.values(filter).some((value) => value !== null && value !== undefined && value !== '');
}
