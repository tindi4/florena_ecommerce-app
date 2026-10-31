import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { Counters } from './models';

/** Compteurs (notifications, messages, commandes à traiter), rafraîchis toutes les 20 s. */
@Injectable({ providedIn: 'root' })
export class AdminCountersService {
  private api = inject(ApiService);
  readonly counters = signal<Counters>({ unreadNotifications: 0, newMessages: 0, todoOrders: 0, unpaidOrders: 0 });
  private timer: any = null;

  start() {
    if (this.timer) return;
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 20000);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async refresh() {
    try { this.counters.set(await this.api.get<Counters>('/admin/counters')); } catch { /* ignoré : 401 géré par l'intercepteur */ }
  }
}
