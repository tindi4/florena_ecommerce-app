import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { CustomerAuthService } from './customer-auth.service';

/**
 * Envoie les cookies et ajoute le BON jeton CSRF : celui de l'admin pour /api/admin, celui du client pour
 * /api/account et pour passer commande (la commande est alors rattachée au compte).
 * Session expirée : retour à la page de connexion correspondante.
 */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const customer = inject(CustomerAuthService);
  const router = inject(Router);
  const isAdminCall = req.url.includes('/api/admin') || req.url.includes('/api/auth/');
  const isCustomerCall = req.url.includes('/api/account') || req.url.includes('/api/customer/') || (req.url.endsWith('/api/orders') && req.method === 'POST');
  let r = req.clone({ withCredentials: true });
  const token = isAdminCall ? auth.csrfToken : isCustomerCall ? customer.csrfToken : null;
  if (req.method !== 'GET' && token) r = r.clone({ setHeaders: { 'X-CSRF-Token': token } });
  return next(r).pipe(catchError((e: HttpErrorResponse) => {
    if (e.status === 401 && req.url.includes('/api/admin')) { auth.clearLocal(); router.navigate(['/admin/login']); }
    if (e.status === 401 && req.url.includes('/api/account')) { customer.clearLocal(); router.navigate(['/connexion']); }
    return throwError(() => e);
  }));
};
