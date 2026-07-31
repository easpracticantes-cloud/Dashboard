import { Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { Observable, of } from 'rxjs';

/**
 * Precarga mínima: no compite con first paint del dashboard.
 * Solo conversaciones (ruta más usada después del mando).
 */
@Injectable({ providedIn: 'root' })
export class CriticalModulesPreloadStrategy implements PreloadingStrategy {
  private readonly critical = new Set(['conversations']);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (route.path && this.critical.has(route.path)) {
      return load();
    }
    return of(null);
  }
}
