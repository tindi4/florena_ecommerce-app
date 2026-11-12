import { Injectable, signal } from '@angular/core';

export interface SavedOrder { orderNumber: string; phone: string; createdAt: string; trackingCode?: string; }
const KEY = 'boutique.orders.v1';

/** Mémorise sur l'appareil les commandes passées pour afficher leur statut en direct. */
@Injectable({ providedIn: 'root' })
export class MyOrdersService {
  readonly orders = signal<SavedOrder[]>(this.read());
  private read(): SavedOrder[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } }
  /** Ajoute le code complet à une commande déjà mémorisée (anciennes commandes). */
  remember(orderNumber: string, trackingCode: string) {
    const list = this.orders().map((o) => (o.orderNumber === orderNumber ? { ...o, trackingCode } : o));
    this.orders.set(list);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }
  add(o: SavedOrder) {
    const list = [o, ...this.orders().filter((x) => x.orderNumber !== o.orderNumber)].slice(0, 20);
    this.orders.set(list);
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
  }
}
