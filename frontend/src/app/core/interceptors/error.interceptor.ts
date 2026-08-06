import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * Global error handling: redirects to /login on 401 (and auth-like failures),
 * leaves everything else to the calling service so it can degrade gracefully.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const msg = String(
        (error.error as { message?: string } | null)?.message || error.message || ''
      ).toLowerCase();
      const looksLikeAuthFailure =
        error.status === 401 ||
        (error.status === 403 &&
          (msg.includes('token') ||
            msg.includes('autentic') ||
            msg.includes('unauthorized') ||
            msg.includes('no autenticado')));

      if (looksLikeAuthFailure && auth.isAuthenticated()) {
        auth.logout();
        void router.navigate(['/login'], { queryParams: { expired: '1' } });
      }
      return throwError(() => error);
    })
  );
};
