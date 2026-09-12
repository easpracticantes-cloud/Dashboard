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
      {
        path: 'documentos',
        pathMatch: 'full',
        redirectTo: '',
      },
      {
        path: 'documentos/:id',
        loadComponent: () =>
          import('./pages/documents/document-detail.component').then(
            (m) => m.DocumentDetailComponent,
          ),
      },
      {
        path: 'autobits',
        loadComponent: () =>
          import('./pages/autobits/autobits.component').then((m) => m.AutobitsComponent),
      },
      {
        path: 'pagos',
        loadComponent: () =>
          import('./pages/payments/payments.component').then((m) => m.PaymentsComponent),
      },
      {
        path: 'paquetes',
        loadComponent: () =>
          import('./pages/packages/packages.component').then((m) => m.PackagesComponent),
      },
      {
        path: 'subsanaciones',
        loadComponent: () =>
          import('./pages/remediations/remediations.component').then(
            (m) => m.RemediationsComponent,
          ),
      },
      {
        path: 'cruce',
        pathMatch: 'full',
        redirectTo: '',
      },
    ],
  },
];
