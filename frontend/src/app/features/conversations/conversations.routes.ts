import { Routes } from '@angular/router';

export const CONVERSATIONS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./conversations-list/conversations-list.component').then((m) => m.ConversationsListComponent)
  },
  {
    path: ':id',
    loadComponent: () => import('./conversation-detail/conversation-detail.component').then((m) => m.ConversationDetailComponent)
  }
];
