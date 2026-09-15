import { Routes } from '@angular/router';

/** Contabilidad = un solo flujo (wizard). Rutas viejas redirigen aquí. */
export const CONTABILIDAD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./contabilidad-shell.component').then((m) => m.ContabilidadShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./pages/wizard/wizard.component').then((m) => m.WizardComponent),
      },
      { path: 'documentos', pathMatch: 'full', redirectTo: '' },
      { path: 'documentos/:id', redirectTo: '' },
      { path: 'autobits', pathMatch: 'full', redirectTo: '' },
      { path: 'pagos', pathMatch: 'full', redirectTo: '' },
      { path: 'paquetes', pathMatch: 'full', redirectTo: '' },
      { path: 'subsanaciones', pathMatch: 'full', redirectTo: '' },
      { path: 'cruce', pathMatch: 'full', redirectTo: '' },
      { path: 'cola', pathMatch: 'full', redirectTo: '' },
      { path: 'dashboard', pathMatch: 'full', redirectTo: '' },
      { path: 'pendientes', pathMatch: 'full', redirectTo: '' },
    ],
  },
];
