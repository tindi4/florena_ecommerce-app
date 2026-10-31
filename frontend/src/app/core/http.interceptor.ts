import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Envoie les cookies, ajoute le jeton CSRF aux écritures admin, renvoie vers /admin/login si la session expire. */
export const apiInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const isAdminCall = req.url.includes('/api/admin') || req.url.includes('/api/auth/');
  let r = req.clone({ withCredentials: true });
  if (isAdminCall && req.method !== 'GET' && auth.csrfToken) r = r.clone({ setHeaders: { 'X-CSRF-Token': auth.csrfToken } });
  return next(r).pipe(catchError((e: HttpErrorResponse) => {
    if (e.status === 401 && req.url.includes('/api/admin')) { auth.clearLocal(); router.navigate(['/admin/login']); }
    return throwError(() => e);
  }));
};
