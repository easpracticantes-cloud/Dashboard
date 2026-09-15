import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'eas-contabilidad-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageHeaderComponent],
  template: `
    <section class="contab">
      <eas-page-header
        eyebrow="Escuela Aves Salento"
        title="Contabilidad"
        subtitle="Facturas en carpetas → Autobits → Excel de cruce."
      />
      <nav class="contab__nav" aria-label="Secciones de Contabilidad">
        <a
          routerLink="/app/contabilidad"
          routerLinkActive="is-on"
          [routerLinkActiveOptions]="{ exact: true }"
        >
          Flujo semanal
        </a>
        <a routerLink="/app/contabilidad/autobits" routerLinkActive="is-on">Autobits</a>
        <a routerLink="/app/contabilidad/documentos" routerLinkActive="is-on">Documentos</a>
        <a routerLink="/app/contabilidad/pagos" routerLinkActive="is-on">Pagos</a>
        <a routerLink="/app/contabilidad/paquetes" routerLinkActive="is-on">Paquetes</a>
        <a routerLink="/app/contabilidad/subsanaciones" routerLinkActive="is-on">Subsanaciones</a>
      </nav>
      <div class="contab__body">
        <router-outlet />
      </div>
    </section>
  `,
  styles: [
    `
      .contab {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 1rem;
        width: 100%;
        max-width: 100%;
        min-width: 0;
      }

      .contab > *,
      .contab__body {
        min-width: 0;
        max-width: 100%;
      }

      .contab__nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
      }

      .contab__nav a {
        display: inline-flex;
        align-items: center;
        padding: 0.45rem 0.85rem;
        border-radius: 999px;
        border: 1px solid var(--eas-line-soft);
        font-size: 0.82rem;
        font-weight: 650;
        text-decoration: none;
        color: var(--eas-muted);
        background: var(--eas-surface);
        transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
      }

      .contab__nav a:hover {
        color: var(--eas-ink);
        border-color: color-mix(in srgb, var(--eas-leaf) 35%, transparent);
        background: color-mix(in srgb, var(--eas-leaf) 8%, transparent);
      }

      .contab__nav a.is-on {
        color: var(--eas-forest);
        border-color: color-mix(in srgb, var(--eas-amber) 45%, var(--eas-leaf));
        background: linear-gradient(
          135deg,
          color-mix(in srgb, var(--eas-amber) 18%, transparent),
          color-mix(in srgb, var(--eas-leaf) 14%, transparent)
        );
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--eas-amber) 22%, transparent);
      }

      .contab__body {
        min-height: 480px;
      }
    `,
  ],
})
export class ContabilidadShellComponent {}
