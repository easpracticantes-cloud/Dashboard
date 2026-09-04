import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'eas-contabilidad-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, PageHeaderComponent],
  template: `
    <section class="contab">
      <eas-page-header
        eyebrow="Módulo Contabilidad AP"
        title="Cuentas por pagar"
        subtitle="Flujo operativo renovado · Autobits → factura → cruce → pago → comprobante → paquete"
      />

      <nav class="contab__nav" aria-label="Secciones de contabilidad">
        @for (item of nav; track item.path) {
          <a
            [routerLink]="item.path"
            routerLinkActive="is-active"
            [routerLinkActiveOptions]="item.exact ? { exact: true } : { exact: false }"
          >
            <mat-icon>{{ item.icon }}</mat-icon>
            <span>{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="contab__body eas-card">
        <router-outlet />
      </div>
    </section>
  `,
  styles: [
    `
      .contab {
        display: grid;
        gap: 1rem;
      }

      .contab__nav {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        padding: 0.35rem;
        border-radius: 16px;
        background: color-mix(in srgb, var(--eas-mist, #eef3f0) 55%, #fff);
        border: 1px solid var(--eas-line-soft);
      }

      .contab__nav a {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.6rem 0.9rem;
        border-radius: 12px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--eas-muted);
        font-size: 0.82rem;
        font-weight: 650;
        text-decoration: none;
        transition: color 0.15s ease, background 0.15s ease;
      }

      .contab__nav a mat-icon {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
      }

      .contab__nav a:hover {
        color: var(--eas-ink);
        background: transparent;
        border-color: transparent;
      }

      .contab__nav a.is-active {
        color: #fff;
        background: linear-gradient(135deg, #1a3d2c, #1f7a4c);
        border-color: transparent;
        box-shadow: none;
      }

      .contab__body {
        padding: 1.15rem 1.2rem 1.45rem;
        min-height: 460px;
        border-radius: 18px;
      }
    `,
  ],
})
export class ContabilidadShellComponent {
  readonly nav = [
    { path: '/app/contabilidad', label: 'Resumen', icon: 'dashboard', exact: true },
    { path: '/app/contabilidad/documentos', label: 'Documentos', icon: 'description', exact: false },
    { path: '/app/contabilidad/procesamiento', label: 'Procesar', icon: 'document_scanner', exact: false },
    { path: '/app/contabilidad/autobits', label: 'Autobits', icon: 'table_chart', exact: false },
    { path: '/app/contabilidad/cruce', label: 'Cruce', icon: 'compare_arrows', exact: false },
    { path: '/app/contabilidad/pendientes', label: 'Pendientes', icon: 'playlist_add_check', exact: false },
    { path: '/app/contabilidad/subsanaciones', label: 'Subsanaciones', icon: 'rule', exact: false },
    { path: '/app/contabilidad/pagos', label: 'Pagos', icon: 'payments', exact: false },
    { path: '/app/contabilidad/cola', label: 'Cola', icon: 'pending_actions', exact: false },
    { path: '/app/contabilidad/paquetes', label: 'Paquetes', icon: 'inventory_2', exact: false },
  ];
}
