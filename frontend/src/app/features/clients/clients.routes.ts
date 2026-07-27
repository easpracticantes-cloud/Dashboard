import { Routes } from '@angular/router';

export const CLIENTS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./clients.component').then((m) => m.ClientsComponent)
  }
];
