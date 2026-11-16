import { Component, HostListener, effect, inject } from '@angular/core';
import { NavigationStart, Router, RouterLink } from '@angular/router';
import { CartService } from '../core/cart.service';
import { AttrsPipe, ImgPipe, MoneyPipe } from './pipes';

/**
 * Panneau latéral « Votre sélection » : il glisse depuis la droite après un ajout au panier,
 * montre l'article ajouté, les quantités et le total, et propose clairement la suite.
 */
@Component({
  selector: 'app-cart-drawer',
  standalone: true,
  imports: [RouterLink, MoneyPipe, ImgPipe, AttrsPipe],
  template: `
    @if (cart.drawerOpen()) {
      <div class="drawer-back" (click)="cart.closeDrawer()" aria-hidden="true"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <header class="drawer-head">
          <div>
            <span class="eyebrow">Votre sélection</span>
            <h2 id="drawer-title">{{ cart.count() }} article{{ cart.count() > 1 ? 's' : '' }}</h2>
          </div>
          <button type="button" class="drawer-x" (click)="cart.closeDrawer()" aria-label="Fermer le panneau">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </header>

        @if (cart.lastAdded() !== null && cart.lines().length) {
          <p class="drawer-added" role="status">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.500 4.500 4.500L19 7.500"/></svg>
            Article ajouté à votre sélection
          </p>
        }

        @if (!cart.lines().length) {
          <div class="drawer-empty">
            <p>Votre sélection est vide.</p>
            <a class="btn ghost" routerLink="/catalogue" (click)="cart.closeDrawer()">Découvrir la collection</a>
          </div>
        } @else {
          <div class="drawer-lines">
            @for (l of cart.lines(); track l.variantId) {
              <article class="drawer-line" [class.fresh]="l.variantId === cart.lastAdded()">
                <a class="drawer-img" [routerLink]="['/produit', l.slug]" (click)="cart.closeDrawer()">
                  @if (l.imageUrl) { <img [src]="l.imageUrl | img" [alt]="l.name" /> } @else { <span class="ph">{{ l.name.charAt(0) }}</span> }
                </a>
                <div class="drawer-info">
                  <strong>{{ l.name }}</strong>
                  @if (l.attributes | attrs; as a) { <span class="muted small">{{ a }}</span> }
                  <div class="drawer-row">
                    <div class="qty sm" role="group" [attr.aria-label]="'Quantité pour ' + l.name">
                      <button type="button" (click)="cart.setQuantity(l.variantId, l.quantity - 1)" [disabled]="l.quantity <= 1" aria-label="Diminuer">−</button>
                      <span>{{ l.quantity }}</span>
                      <button type="button" (click)="cart.setQuantity(l.variantId, l.quantity + 1)" [disabled]="l.quantity >= (l.max ?? 99)" aria-label="Augmenter">+</button>
                    </div>
                    <span class="drawer-price">{{ l.price * l.quantity | money }}</span>
                  </div>
                  <button type="button" class="link-btn small drawer-rm" (click)="cart.remove(l.variantId)">Retirer</button>
                </div>
              </article>
            }
          </div>
          <footer class="drawer-foot">
            <div class="drawer-total"><span>Total</span><strong>{{ cart.total() | money }}</strong></div>
            <p class="muted small">Livraison précisée à la commande · aucun paiement en ligne.</p>
            <a class="btn block" routerLink="/commande" (click)="cart.closeDrawer()">Passer la commande</a>
            <button type="button" class="btn ghost block drawer-continue" (click)="cart.closeDrawer()">Continuer mes achats</button>
            <a class="drawer-cartlink" routerLink="/panier" (click)="cart.closeDrawer()">Voir le panier en détail</a>
          </footer>
        }
      </aside>
    }`,
})
export class CartDrawer {
  cart = inject(CartService);
  private router = inject(Router);

  constructor() {
    // Ferme le panneau à chaque changement de page.
    this.router.events.subscribe((e) => { if (e instanceof NavigationStart) this.cart.closeDrawer(); });
    // Empêche la page de défiler derrière le panneau.
    effect(() => { document.body.classList.toggle('no-scroll', this.cart.drawerOpen()); });
  }

  @HostListener('document:keydown.escape') onEscape() { if (this.cart.drawerOpen()) this.cart.closeDrawer(); }
}
