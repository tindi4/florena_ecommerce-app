import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { CartCheckItem } from '../../core/models';
import { ImgPipe, MoneyPipe, AttrsPipe } from '../../shared/pipes';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [RouterLink, MoneyPipe, ImgPipe, AttrsPipe],
  template: `
    <div class="container section">
      <header class="page-head"><span class="eyebrow">Votre sélection</span><h1>Mon panier</h1></header>
      @if (!cart.lines().length) {
        <div class="empty"><h3>Votre panier est vide</h3><p>Parcourez le catalogue pour ajouter des articles.</p><a class="btn" routerLink="/catalogue">Voir le catalogue</a></div>
      } @else {
        @for (n of notices(); track n) { <div class="notice warn" role="alert">{{ n }}</div> }
        <div class="cart-grid">
          <div class="stack">
            @for (l of cart.lines(); track l.variantId) {
              <article class="cart-line card flat" [class.unavail]="isUnavailable(l.variantId)">
                <a class="cart-img" [routerLink]="['/produit', l.slug]">@if (l.imageUrl) { <img [src]="l.imageUrl | img" [alt]="l.name" /> } @else { <div class="ph">{{ l.name.charAt(0) }}</div> }</a>
                <div class="cart-info">
                  <h3><a [routerLink]="['/produit', l.slug]">{{ l.name }}</a></h3>
                  <p class="muted small">{{ l.attributes | attrs }}</p>
                  <p class="small">{{ l.price | money }} l'unité</p>
                  @if (isUnavailable(l.variantId)) { <p class="err">Cet article n'est plus disponible. Retirez-le pour continuer.</p> }
                </div>
                <div class="cart-qty">
                  <div class="qty" role="group" aria-label="Quantité">
                    <button type="button" (click)="setQty(l.variantId, l.quantity - 1)" [disabled]="l.quantity <= 1" aria-label="Diminuer">−</button>
                    <span>{{ l.quantity }}</span>
                    <button type="button" (click)="setQty(l.variantId, l.quantity + 1)" [disabled]="l.quantity >= maxFor(l.variantId)" aria-label="Augmenter">+</button>
                  </div>
                  <strong>{{ l.price * l.quantity | money }}</strong>
                  <button type="button" class="link-btn small" (click)="cart.remove(l.variantId)">Supprimer</button>
                </div>
              </article>
            }
          </div>
          <aside class="card summary">
            <h2>Récapitulatif</h2>
            <div class="row between"><span>Articles</span><span>{{ cart.count() }}</span></div>
            <div class="row between total"><span>Total</span><strong>{{ cart.total() | money }}</strong></div>
            <a class="btn ghost block" routerLink="/catalogue">Continuer mes achats</a>
            <a class="btn block" routerLink="/commande" [class.disabled]="blocked()" [attr.aria-disabled]="blocked()">Passer à la commande</a>
            @if (!account.customer()) {
              <p class="join-note">Envie d'aller plus vite la prochaine fois ? <a routerLink="/connexion" [queryParams]="{mode: 'creer', retour: '/panier'}">Créez votre compte</a> : vos coordonnées seront déjà prêtes.</p>
            }
          </aside>
        </div>
      }
    </div>`,
})
export class CartPage implements OnInit {
  private api = inject(ApiService);
  cart = inject(CartService);
  account = inject(CustomerAuthService);
  notices = signal<string[]>([]);
  private check = signal<Record<number, CartCheckItem>>({});
  blocked = computed(() => this.cart.lines().some((l) => this.isUnavailable(l.variantId)));

  isUnavailable = (id: number) => this.check()[id] ? !this.check()[id].available : false;
  maxFor = (id: number) => Math.min(99, this.check()[id]?.stock ?? 99);

  async setQty(id: number, q: number) { this.cart.setQuantity(id, Math.min(q, this.maxFor(id))); }

  /** Compare le panier du navigateur aux prix/stocks réels du serveur et signale tout changement. */
  async ngOnInit() {
    const lines = this.cart.lines();
    if (!lines.length) return;
    try {
      const r = await this.api.post<{ items: CartCheckItem[] }>('/cart/check', { items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) });
      const map: Record<number, CartCheckItem> = {};
      const notes: string[] = [];
      for (const it of r.items) {
        map[it.variantId] = it;
        const line = lines.find((l) => l.variantId === it.variantId);
        if (!line) continue;
        if (!it.available) { notes.push(`« ${line.name} » n'est plus disponible.`); continue; }
        if (it.price !== undefined && it.price !== line.price) {
          notes.push(`Le prix de « ${line.name} » est passé de ${line.price} à ${it.price}. Vérifiez votre panier.`);
          this.cart.update(line.variantId, { price: it.price });
        }
        if (it.stock !== undefined && line.quantity > it.stock) {
          notes.push(`Seulement ${it.stock} exemplaire(s) disponible(s) pour « ${line.name} » : quantité ajustée.`);
          this.cart.setQuantity(line.variantId, it.stock);
        }
      }
      this.check.set(map); this.notices.set(notes);
    } catch { /* hors ligne : le serveur revérifiera à la commande */ }
  }
}
