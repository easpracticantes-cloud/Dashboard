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
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      {
        path: 'documentos',
        loadComponent: () =>
          import('./pages/documents/documents-list.component').then((m) => m.DocumentsListComponent)
      },
      {
        path: 'documentos/:id',
        loadComponent: () =>
          import('./pages/documents/document-detail.component').then((m) => m.DocumentDetailComponent)
      },
      {
        path: 'procesamiento',
        loadComponent: () =>
          import('./pages/processing/processing.component').then((m) => m.ProcessingComponent)
      },
      {
        path: 'autobits',
        loadComponent: () =>
          import('./pages/autobits/autobits.component').then((m) => m.AutobitsComponent)
      },
      {
        path: 'cruce',
        loadComponent: () =>
          import('./pages/crossings/crossings.component').then((m) => m.CrossingsComponent)
      },
      {
        path: 'pendientes',
        loadComponent: () =>
          import('./pages/pending/pending.component').then((m) => m.PendingComponent)
      },
      {
        path: 'subsanaciones',
        loadComponent: () =>
          import('./pages/remediations/remediations.component').then((m) => m.RemediationsComponent)
      },
      {
        path: 'pagos',
        loadComponent: () =>
          import('./pages/payments/payments.component').then((m) => m.PaymentsComponent)
      },
      {
        path: 'paquetes',
        loadComponent: () =>
          import('./pages/packages/packages.component').then((m) => m.PackagesComponent)
      },
      {
        path: 'cola',
        loadComponent: () =>
          import('./pages/cola/cola.component').then((m) => m.ColaComponent)
      }
    ]
  }
];
