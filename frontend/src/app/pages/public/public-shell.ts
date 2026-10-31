import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConfigService } from '../../core/config.service';
import { CartService } from '../../core/cart.service';

@Component({
  selector: 'app-public-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip" href="#main">Aller au contenu</a>
    <header class="site-header">
      <div class="container hdr">
        <a routerLink="/" class="brand" [attr.aria-label]="cfg.shopName() + ' - accueil'">
          <span class="brand-mark" aria-hidden="true">{{ cfg.shopName().charAt(0) }}</span>
          <span class="brand-name">{{ cfg.shopName() }}</span>
        </a>
        <form class="search" role="search" (submit)="search($event, q.value)">
          <label class="sr-only" for="q">Rechercher un produit</label>
          <input #q id="q" class="input" type="search" placeholder="Rechercher un produit" maxlength="80" />
          <button class="btn" type="submit">Rechercher</button>
        </form>
        <nav class="nav" aria-label="Navigation principale">
          <a routerLink="/catalogue" routerLinkActive="on">Catalogue</a>
          <a routerLink="/suivi" routerLinkActive="on">Suivi</a>
          <a routerLink="/contact" routerLinkActive="on">Contact</a>
          <a routerLink="/panier" class="cart-link" aria-label="Panier">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>
            <span class="cart-count" [class.has]="cart.count() > 0">{{ cart.count() }}</span>
          </a>
        </nav>
      </div>
    </header>
    <main id="main"><router-outlet /></main>
    <footer class="site-footer">
      <div class="container foot">
        <div><strong>{{ cfg.shopName() }}</strong><p class="small">Commandez en ligne, nous vous contactons pour la livraison ou le retrait.</p></div>
        <nav aria-label="Pied de page"><a routerLink="/catalogue">Catalogue</a><a routerLink="/suivi">Suivre ma commande</a><a routerLink="/contact">Nous écrire</a></nav>
        <p class="small">© {{ year }} {{ cfg.shopName() }}</p>
      </div>
    </footer>`,
})
export class PublicShell {
  cfg = inject(ConfigService);
  cart = inject(CartService);
  private router = inject(Router);
  year = new Date().getFullYear();
  search(e: Event, value: string) {
    e.preventDefault();
    this.router.navigate(['/catalogue'], { queryParams: { search: value.trim() || null } });
  }
}
