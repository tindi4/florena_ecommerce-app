import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ApiService } from './api.service';
import { ThemeService } from './theme.service';

export interface Customer { id: number; name: string | null; username: string | null; phone: string; theme: 'light' | 'dark'; }
interface SessionResponse { customer: Customer; csrfToken: string; }

/**
 * Session CLIENT : cookie HttpOnly « customer_token », indépendant de la session admin.
 * Le jeton CSRF client est gardé en mémoire (jamais dans localStorage), séparé du jeton CSRF admin.
 */
@Injectable({ providedIn: 'root' })
export class CustomerAuthService {
  private api = inject(ApiService);
  private theme = inject(ThemeService);
  readonly customer = signal<Customer | null>(null);
  csrfToken: string | null = null;
  private restored: Promise<boolean> | null = null;

  /** Une seule requête /customer/me au démarrage, partagée par tous ceux qui la demandent. */
  restore(): Promise<boolean> {
    if (this.customer()) return Promise.resolve(true);
    this.restored ??= this.api.get<SessionResponse>('/customer/me')
      .then((r) => { this.start(r); return true; })
      .catch(() => false);
    return this.restored;
  }

  async login(identifier: string, password: string) { this.start(await this.api.post<SessionResponse>('/customer/login', { identifier, password })); }
  async register(body: { phone: string; username?: string; name?: string; password: string }) {
    this.start(await this.api.post<SessionResponse>('/customer/register', body));
  }
  /** Après un changement de mot de passe, le serveur renvoie une nouvelle session. */
  start(r: SessionResponse) {
    this.customer.set(r.customer); this.csrfToken = r.csrfToken;
    this.restored = Promise.resolve(true);
    this.theme.set(r.customer.theme);
  }
  async logout() {
    try { await this.api.post('/customer/logout', {}); } catch { /* ignore */ }
    this.clearLocal();
  }
  clearLocal() { this.customer.set(null); this.csrfToken = null; this.restored = Promise.resolve(false); }
}

/** /mon-compte : client connecté, sinon page de connexion (avec retour prévu). */
export const customerGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(CustomerAuthService);
  const router = inject(Router);
  if (await auth.restore()) return true;
  return router.createUrlTree(['/connexion'], { queryParams: { retour: state.url } });
};
