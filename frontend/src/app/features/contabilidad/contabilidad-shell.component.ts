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
        eyebrow="Contabilidad"
        title="Contabilidad AP"
        subtitle="Autobits → Facturas → Generar Excel."
      />
      <nav class="contab__nav" aria-label="Secciones de Contabilidad">
        <a
          routerLink="/app/contabilidad"
          routerLinkActive="is-on"
          [routerLinkActiveOptions]="{ exact: true }"
        >
          Facturas
        </a>
        <a routerLink="/app/contabilidad/autobits" routerLinkActive="is-on">Autobits</a>
        <a routerLink="/app/contabilidad/pagos" routerLinkActive="is-on">Pagos</a>
        <a routerLink="/app/contabilidad/paquetes" routerLinkActive="is-on">Paquetes</a>
        <a routerLink="/app/contabilidad/subsanaciones" routerLinkActive="is-on">Remediaciones</a>
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
        padding: 0.4rem 0.75rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
        text-decoration: none;
        color: inherit;
        background: color-mix(in srgb, currentColor 8%, transparent);
      }

      .contab__nav a.is-on {
        background: color-mix(in srgb, currentColor 16%, transparent);
      }

      .contab__body {
        min-height: 480px;
      }
    `,
  ],
})
export class ContabilidadShellComponent {}
