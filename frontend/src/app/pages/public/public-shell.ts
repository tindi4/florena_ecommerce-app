import { Component, computed, effect, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ConfigService } from '../../core/config.service';
import { CartService } from '../../core/cart.service';
import { CustomerAuthService } from '../../core/customer-auth.service';

@Component({
  selector: 'app-public-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <a class="skip" href="#main">Aller au contenu</a>
    @if (showAnnounce()) {
      <div class="announce">
        <div class="container">
          <span>Commandez en quelques minutes, suivez votre commande en direct.</span>
          <a routerLink="/catalogue">Découvrir la collection
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
        </div>
      </div>
    }
    <header class="site-header">
      <div class="container hdr">
        <a routerLink="/" class="brand" [attr.aria-label]="cfg.shopName() + ' - accueil'">
          @if (cfg.logoUrl(); as logo) { <img class="brand-logo" [src]="logo" alt="" /> }
          @else { <span class="brand-mark" aria-hidden="true">{{ cfg.shopName().charAt(0) }}</span> }
          <span class="brand-name">{{ cfg.shopName() }}</span>
        </a>
        <nav class="nav" aria-label="Navigation principale">
          <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }">Accueil</a>
          <a routerLink="/catalogue" routerLinkActive="on">Catalogue</a>
          <a routerLink="/suivi" routerLinkActive="on">Suivi</a>
          <a routerLink="/contact" routerLinkActive="on">Contact</a>
        </nav>
        <form class="search" role="search" (submit)="search($event, q.value)">
          <label class="sr-only" for="q">Rechercher un produit</label>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/></svg>
          <input #q id="q" class="input" type="search" placeholder="Rechercher un produit…" maxlength="80" />
        </form>
        <div class="hdr-actions">
          <a [routerLink]="account.customer() ? '/mon-compte' : '/connexion'" routerLinkActive="on" class="hdr-icon" [attr.aria-label]="account.customer() ? 'Mon compte' : 'Connexion'" [attr.title]="account.customer() ? 'Mon compte' : 'Se connecter ou créer un compte'">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>
          </a>
          <a routerLink="/panier" routerLinkActive="on" class="hdr-icon cart-link" aria-label="Panier" title="Panier">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
            <span class="cart-count" [class.has]="cart.count() > 0" [class.bump]="bump()">{{ cart.count() }}</span>
          </a>
        </div>
      </div>
    </header>
    <main id="main"><router-outlet /></main>
    <footer class="site-footer">
      <div class="container foot">
        <div>
          <strong class="foot-brand">{{ cfg.shopName() }}</strong>
          <p>Sacs, chaussures et vêtements choisis avec soin. Commande en ligne, livraison ou retrait à la boutique.</p>
        </div>
        <nav class="foot-links" aria-label="Pied de page">
          <h4>La boutique</h4>
          <a routerLink="/catalogue">Notre catalogue</a><a routerLink="/suivi">Suivre ma commande</a>
          @if (account.customer()) { <a routerLink="/mon-compte">Mon compte</a> }
          @else { <a routerLink="/connexion">Connexion</a><a routerLink="/connexion" [queryParams]="{mode: 'creer'}">Créer un compte</a> }
        </nav>
        <div class="foot-links">
          <h4>Restons en contact</h4>
          <a routerLink="/contact">Nous écrire</a>
          @if (waLink(); as link) { <a class="btn wa sm" [href]="link" target="_blank" rel="noopener">Discuter sur WhatsApp</a> }
        </div>
      </div>
      <p class="container foot-tag">L’élégance ne s’impose pas, elle se remarque.</p>
      <div class="container foot-bottom"><span>© {{ year }} {{ cfg.shopName() }}</span><span>Sélection soignée, commande sans paiement en ligne.</span></div>
    </footer>
    @if (waLink(); as link) {
      <a class="wa-float" [href]="link" target="_blank" rel="noopener" aria-label="Discuter sur WhatsApp">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.200Zm4.5-6.1c-.2-.1-1.500-.7-1.700-.8-.2-.1-.4-.1-.6.100l-.8 1c-.1.200-.3.200-.5.100a6.700 6.700 0 0 1-3.300-2.900c-.2-.4.200-.4.700-1.300.1-.2 0-.3 0-.5l-.8-1.800c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.100-.7.300-.2.300-.9.900-.9 2.200s.9 2.500 1.100 2.700c.1.200 1.900 2.900 4.600 4 .6.300 1.100.4 1.500.5.600.2 1.200.2 1.600.1.500-.1 1.500-.6 1.700-1.200.2-.6.2-1.100.2-1.200-.1-.1-.2-.2-.5-.3Z"/></svg>
      </a>
    }`,
})
export class PublicShell {
  cfg = inject(ConfigService);
  cart = inject(CartService);
  account = inject(CustomerAuthService);
  private router = inject(Router);
  year = new Date().getFullYear();
  bump = signal(false);
  /** Le bandeau d'information n'apparaît que sur les pages Suivi et Contact. */
  private url = signal(this.router.url);
  showAnnounce = computed(() => /^\/(suivi|contact)(\/|\?|$)/.test(this.url()));
  waLink = () => this.cfg.whatsappLink(`Bonjour ${this.cfg.shopName()}, j'ai une question.`);
  constructor() {
    this.account.restore();   // affiche « Mon compte » si une session client existe déjà
    this.router.events.subscribe((e) => { if (e instanceof NavigationEnd) this.url.set(e.urlAfterRedirects); });
    let first = true;
    effect(() => {
      this.cart.count();
      if (first) { first = false; return; }
      this.bump.set(true); setTimeout(() => this.bump.set(false), 500);
    });
  }
  search(e: Event, value: string) {
    e.preventDefault();
    this.router.navigate(['/catalogue'], { queryParams: { search: value.trim() || null } });
  }
}
