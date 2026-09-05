import { Routes } from '@angular/router';

export const REGISTRO_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./registro.component').then((m) => m.RegistroComponent),
  },
];
