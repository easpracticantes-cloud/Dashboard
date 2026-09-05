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
        title="Cruce semanal"
        subtitle="Autobits → Excel de cruces → facturas. Sin módulos sueltos."
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
        gap: 1rem;
      }

      .contab__body {
        min-height: 480px;
      }
    `,
  ],
})
export class ContabilidadShellComponent {}
