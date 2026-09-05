import { Routes } from '@angular/router';

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
    ],
  },
];
