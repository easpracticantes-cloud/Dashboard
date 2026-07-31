import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

/** Precarga módulos principales usados en navegación diaria. */
@Injectable({ providedIn: 'root' })
export class CriticalModulesPreloadStrategy implements PreloadingStrategy {
  private readonly critical = new Set([
    'dashboard',
    'conversations',
    'clients',
    'analytics',
    'quotes',
    'reservations',
    'sales'
  ]);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.path && this.critical.has(route.path)) {
      return load();
    }
    return of(null);
  }
}
