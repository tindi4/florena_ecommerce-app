import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

import { Permission } from './models';

export interface AdminUser { id: number; name: string; email: string; role: string; roleId: number | null; roleName: string; isMain: boolean; permissions: Permission[]; }

/** Session admin : cookie HttpOnly (invisible pour JS). Le jeton CSRF reste en mémoire uniquement. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  readonly user = signal<AdminUser | null>(null);
  csrfToken: string | null = null;
  private restored = false;

  /**
   * Le rôle donne-t-il AU MOINS UNE de ces permissions ? Sert uniquement à masquer l'interface :
   * la vraie protection est côté serveur (requirePermission sur chaque route).
   */
  can(...p: Permission[]): boolean { const mine = this.user()?.permissions ?? []; return p.some((x) => mine.includes(x)); }
  /** Première page autorisée pour ce rôle. */
  homePath(): string {
    const pages: [Permission, string][] = [['orders.view', '/admin/dashboard'], ['messages', '/admin/messages'], ['products', '/admin/produits'],
      ['stock', '/admin/stock'], ['stats', '/admin/statistiques'], ['team', '/admin/equipe'], ['settings', '/admin/reglages']];
    return pages.find(([perm]) => this.can(perm))?.[1] ?? '/admin/aucun-acces';
  }

  async restore(): Promise<boolean> {
    if (this.user()) return true;
    if (this.restored && !this.user()) return false;
    try {
      const r = await this.api.get<{ user: AdminUser; csrfToken: string }>('/auth/me');
      this.user.set(r.user); this.csrfToken = r.csrfToken;
      return true;
    } catch { this.restored = true; return false; }
  }

  async login(email: string, password: string) {
    const r = await this.api.post<{ user: AdminUser; csrfToken: string }>('/auth/login', { email, password });
    this.user.set(r.user); this.csrfToken = r.csrfToken; this.restored = true;
  }

  async logout() {
    try { await this.api.post('/auth/logout', {}); } catch { /* ignore */ }
    this.user.set(null); this.csrfToken = null; this.restored = true;
  }

  clearLocal() { this.user.set(null); this.csrfToken = null; this.restored = true; }
}
