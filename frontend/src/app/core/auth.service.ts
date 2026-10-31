import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface AdminUser { id: number; name: string; email: string; role: string; }

/** Session admin : cookie HttpOnly (invisible pour JS). Le jeton CSRF reste en mémoire uniquement. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  readonly user = signal<AdminUser | null>(null);
  csrfToken: string | null = null;
  private restored = false;

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
