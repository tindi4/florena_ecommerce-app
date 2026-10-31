import { Injectable, computed, signal } from '@angular/core';
import { CartLine } from './models';

const KEY = 'boutique.cart.v1';

/** Panier du navigateur. Ce n'est PAS une source de vérité : le serveur revérifie prix et stock à chaque commande. */
@Injectable({ providedIn: 'root' })
export class CartService {
  readonly lines = signal<CartLine[]>(this.read());
  readonly count = computed(() => this.lines().reduce((s, l) => s + l.quantity, 0));
  readonly total = computed(() => this.lines().reduce((s, l) => s + l.price * l.quantity, 0));

  private read(): CartLine[] {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  }
  private write(lines: CartLine[]) {
    this.lines.set(lines);
    try { localStorage.setItem(KEY, JSON.stringify(lines)); } catch { /* stockage indisponible */ }
  }

  add(line: CartLine, max: number) {
    const lines = [...this.lines()];
    const i = lines.findIndex((l) => l.variantId === line.variantId);
    if (i >= 0) lines[i] = { ...lines[i], price: line.price, quantity: Math.min(max, lines[i].quantity + line.quantity) };
    else lines.push({ ...line, quantity: Math.min(max, line.quantity) });
    this.write(lines);
  }
  setQuantity(variantId: number, quantity: number) {
    this.write(this.lines().map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(1, Math.min(99, quantity)) } : l)));
  }
  update(variantId: number, patch: Partial<CartLine>) {
    this.write(this.lines().map((l) => (l.variantId === variantId ? { ...l, ...patch } : l)));
  }
  remove(variantId: number) { this.write(this.lines().filter((l) => l.variantId !== variantId)); }
  clear() { this.write([]); }
}
