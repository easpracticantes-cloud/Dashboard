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
        eyebrow="Módulo Contabilidad"
        title="Contabilidad IA"
        subtitle="Autobits → documentos OCR → cruce → pagos → paquete digital"
      />

      <nav class="contab__nav" aria-label="Secciones de contabilidad">
        @for (item of nav; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="is-active" [routerLinkActiveOptions]="item.exact ? { exact: true } : { exact: false }">
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
      }

      .contab__nav a {
        display: inline-flex;
        align-items: center;
        gap: 0.4rem;
        padding: 0.55rem 0.85rem;
        border-radius: 12px;
        border: 1px solid var(--eas-line-soft);
        background: var(--eas-surface);
        color: var(--eas-muted);
        font-size: 0.82rem;
        font-weight: 650;
        text-decoration: none;
        transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
      }

      .contab__nav a mat-icon {
        font-size: 18px !important;
        width: 18px !important;
        height: 18px !important;
      }

      .contab__nav a:hover {
        color: var(--eas-ink);
        border-color: color-mix(in srgb, var(--eas-leaf) 35%, var(--eas-line));
      }

      .contab__nav a.is-active {
        color: #fff;
        background: linear-gradient(135deg, #1a3d2c, #1f7a4c);
        border-color: transparent;
        box-shadow: 0 10px 22px rgba(20, 38, 28, 0.18);
      }

      .contab__body {
        padding: 1.15rem 1.2rem 1.35rem;
        min-height: 420px;
      }
    `
  ]
})
export class ContabilidadShellComponent {
  readonly nav = [
    { path: '/app/contabilidad', label: 'Resumen', icon: 'dashboard', exact: true },
    { path: '/app/contabilidad/documentos', label: 'Documentos', icon: 'description', exact: false },
    { path: '/app/contabilidad/procesamiento', label: 'Procesar', icon: 'document_scanner', exact: false },
    { path: '/app/contabilidad/autobits', label: 'Autobits', icon: 'table_chart', exact: false },
    { path: '/app/contabilidad/cruce', label: 'Cruce', icon: 'compare_arrows', exact: false },
    { path: '/app/contabilidad/subsanaciones', label: 'Subsanaciones', icon: 'rule', exact: false },
    { path: '/app/contabilidad/pagos', label: 'Pagos', icon: 'payments', exact: false },
    { path: '/app/contabilidad/paquetes', label: 'Paquetes', icon: 'inventory_2', exact: false }
  ];
}
