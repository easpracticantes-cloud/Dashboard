import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { moduleLabelFromUrl } from './ave-app-context';
import { AveEntityFocus, compactAveUiContext } from './ave-ui-context';

@Injectable({ providedIn: 'root' })
export class AveUiContextService {
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  readonly entity = signal<AveEntityFocus | null>(null);
  readonly hits = signal<Array<{ id: string; label: string }>>([]);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  setEntity(entity: AveEntityFocus | null): void {
    this.entity.set(entity);
  }

  clearEntity(): void {
    this.entity.set(null);
  }

  setHits(hits: Array<{ id: string; label: string }>): void {
    this.hits.set(hits);
  }

  clearHits(): void {
    this.hits.set([]);
  }

  compact(): string {
    return compactAveUiContext({
      module: moduleLabelFromUrl(this.url()),
      role: this.auth.currentUser()?.rol,
      entity: this.entity(),
      hits: this.hits()
    });
  }
}
