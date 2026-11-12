import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

// Important : inject() doit être appelé AVANT tout `await` (le contexte d'injection disparaît ensuite).

/** Toute route /admin/* exige une session valide, sinon redirection vers /admin/login. */
export const adminGuard: CanActivateFn & CanActivateChildFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.restore()) return true;
  return router.createUrlTree(['/admin/login']);
};

/** Déjà connecté ? /admin/login renvoie directement vers l'administration. */
export const loginGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (await auth.restore()) return router.createUrlTree([auth.homePath()]);
  return true;
};

/** Page réservée : `data: { perm: 'orders.view' }` ou `data: { perm: ['orders.view', 'messages'] }` (au moins une). */
export const permissionGuard: CanActivateFn = async (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!(await auth.restore())) return router.createUrlTree(['/admin/login']);
  const perm = route.data['perm'];
  if (!perm || auth.can(...(Array.isArray(perm) ? perm : [perm]))) return true;
  return router.createUrlTree([auth.homePath()]);
};
