import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { RoleCode } from '../models/role.model';
import { AuthService } from '../services/auth.service';

export const roleGuard = (allowed: RoleCode[]): CanActivateFn => () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.hasAnyRole(allowed)) {
    return true;
  }
  return router.createUrlTree(['/app/dashboard']);
};
