import { Injectable, computed, signal } from '@angular/core';
import { AnalyticsFilter, emptyAnalyticsFilter, hasActiveAnalyticsFilters } from '../models/analytics-filter.model';

/**
 * Signal-based global filter store shared by Dashboard, Analítica y Conversaciones,
 * asi el equipo explora los mismos datos filtrados sin duplicar estado por pantalla.
 */
@Injectable({ providedIn: 'root' })
export class CrmFilterStore {
  private readonly state = signal<AnalyticsFilter>(emptyAnalyticsFilter());

  readonly filter = this.state.asReadonly();
  readonly hasActiveFilters = computed(() => hasActiveAnalyticsFilters(this.state()));
  readonly activeCount = computed(
    () => Object.values(this.state()).filter((value) => value !== null && value !== undefined && value !== '').length
  );

  patch(partial: Partial<AnalyticsFilter>): void {
    this.state.update((current) => ({ ...current, ...partial }));
  }

  set(filter: AnalyticsFilter): void {
    this.state.set({ ...emptyAnalyticsFilter(), ...filter });
  }

  clear(): void {
    this.state.set(emptyAnalyticsFilter());
  }
}
