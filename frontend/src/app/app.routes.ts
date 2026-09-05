import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { roleGuard } from './core/guards/role.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: '',
    canActivate: [guestGuard],
    loadChildren: () => import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES)
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadChildren: () => import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES)
      },
      {
        path: 'registro',
        loadChildren: () => import('./features/registro/registro.routes').then((m) => m.REGISTRO_ROUTES)
      },
      { path: 'conversations', redirectTo: 'registro', pathMatch: 'prefix' },
      { path: 'clients', redirectTo: 'registro', pathMatch: 'prefix' },
      { path: 'quotes', redirectTo: 'registro', pathMatch: 'prefix' },
      { path: 'reservations', redirectTo: 'registro', pathMatch: 'prefix' },
      { path: 'sales', redirectTo: 'registro', pathMatch: 'prefix' },
      {
        path: 'contabilidad',
        canActivate: [roleGuard(['ADMINISTRADOR', 'GERENCIA', 'CONTABILIDAD', 'SUPERVISOR'])],
        loadChildren: () =>
          import('./features/contabilidad/contabilidad.routes').then((m) => m.CONTABILIDAD_ROUTES)
      },
      {
        path: 'analytics',
        loadChildren: () => import('./features/analytics/analytics.routes').then((m) => m.ANALYTICS_ROUTES)
      },
      {
        path: 'ai',
        loadChildren: () => import('./features/ai/ai.routes').then((m) => m.AI_ROUTES)
      },
      {
        path: 'help',
        loadChildren: () => import('./features/help/help.routes').then((m) => m.HELP_ROUTES)
      },
      {
        path: 'history',
        loadChildren: () => import('./features/history/history.routes').then((m) => m.HISTORY_ROUTES)
      },
      {
        path: 'notifications',
        loadChildren: () => import('./features/notifications/notifications.routes').then((m) => m.NOTIFICATIONS_ROUTES)
      },
      {
        path: 'settings',
        loadChildren: () => import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES)
      },
      {
        path: 'profile',
        loadChildren: () => import('./features/profile/profile.routes').then((m) => m.PROFILE_ROUTES)
      },
      {
        path: 'users',
        canActivate: [roleGuard(['ADMINISTRADOR', 'GERENCIA', 'SUPERVISOR'])],
        loadChildren: () => import('./features/users/users.routes').then((m) => m.USERS_ROUTES)
      },
      {
        path: 'reports',
        loadChildren: () => import('./features/reports/reports.routes').then((m) => m.REPORTS_ROUTES)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
