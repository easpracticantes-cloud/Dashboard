import { Routes } from '@angular/router';

export const NOTIFICATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./notifications.component').then((m) => m.NotificationsComponent)
  }
];
