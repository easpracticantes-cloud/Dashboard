import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageHeaderComponent } from '../../shared/components/page-header/page-header.component';

@Component({
  selector: 'eas-contabilidad-shell',
  standalone: true,
  imports: [RouterOutlet, PageHeaderComponent],
  template: `
    <section class="contab">
      <eas-page-header
        eyebrow="Contabilidad"
        title="Contabilidad AP"
        subtitle="Autobits → Facturas → Generar Excel de cruce."
      />
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

      .contab__body {
        min-height: 480px;
      }
    `,
  ],
})
export class ContabilidadShellComponent {}
