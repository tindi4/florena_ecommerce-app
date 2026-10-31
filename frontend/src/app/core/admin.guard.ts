import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  if (await auth.restore()) return true;
  return inject(Router).createUrlTree(['/admin/login']);
};
