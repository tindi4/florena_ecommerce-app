import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { AdminCountersService } from '../../core/admin-counters.service';
import { ConfigService } from '../../core/config.service';

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="adm" [class.open]="menu()" (click)="counters.unlock()">
      <header class="adm-top">
        <button class="adm-burger" type="button" (click)="menu.set(!menu())" aria-label="Menu">☰</button>
        @if (cfg.logoUrl(); as logo) { <img class="adm-logo" [src]="logo" alt="" /> }
        <strong class="adm-title">{{ cfg.shopName() }}</strong>
        @if (auth.can('orders.view', 'messages')) {
          <a class="adm-bell" [class.ring]="counters.ringing()" routerLink="/admin/notifications" [attr.aria-label]="c().unreadNotifications + ' notifications non lues'">
            🔔 @if (c().unreadNotifications > 0) { <span class="bell-count" [class.pulse]="counters.ringing()">{{ c().unreadNotifications }}</span> }
          </a>
        }
      </header>
      <aside class="adm-side" (click)="menu.set(false)">
        <div class="adm-brand">
          @if (cfg.logoUrl(); as logo) { <img class="adm-logo" [src]="logo" [alt]="'Logo ' + cfg.shopName()" /> }
          @else { <span class="brand-mark" aria-hidden="true">{{ cfg.shopName().charAt(0) }}</span> }
          <div><strong>{{ cfg.shopName() }}</strong><small>Administration</small></div>
        </div>
        <nav aria-label="Administration">
          <!-- Chaque lien n'apparaît qu'avec la permission correspondante (le serveur revérifie toujours). -->
          @if (auth.can('orders.view', 'messages', 'stats')) { <span class="adm-nav-label">Activité</span> }
          @if (auth.can('orders.view')) {
            <a routerLink="/admin/dashboard" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z"/></svg>Tableau de bord</a>
            <a routerLink="/admin/commandes" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>Commandes @if (c().todoOrders > 0) { <span class="pill">{{ c().todoOrders }}</span> }</a>
          }
          @if (auth.can('orders.view', 'messages')) {
            <a routerLink="/admin/notifications" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>Notifications @if (c().unreadNotifications > 0) { <span class="pill hot" [class.pulse]="counters.ringing()">{{ c().unreadNotifications }}</span> }</a>
          }
          @if (auth.can('messages')) { <a routerLink="/admin/messages" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.5A8 8 0 1 1 21 12Z"/></svg>Messages @if (c().newMessages > 0) { <span class="pill hot">{{ c().newMessages }}</span> }</a> }
          @if (auth.can('stats')) { <a routerLink="/admin/statistiques" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/></svg>Statistiques</a> }
          @if (auth.can('products', 'stock')) { <span class="adm-nav-label">Boutique</span> }
          @if (auth.can('stock')) { <a routerLink="/admin/stock" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>Stock</a> }
          @if (auth.can('products')) {
            <a routerLink="/admin/produits" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>Articles</a>
            <a routerLink="/admin/categories" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>Catégories de produits</a>
          }
          @if (auth.can('team', 'settings')) { <span class="adm-nav-label">Gestion</span> }
          @if (auth.can('team')) { <a routerLink="/admin/equipe" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 19a4 4 0 0 0-8 0"/><circle cx="12" cy="8" r="3"/><path d="M20 19a3.5 3.5 0 0 0-3-3.400M4 19a3.500 3.500 0 0 1 3-3.400"/></svg>Équipe</a> }
          @if (auth.can('settings')) { <a routerLink="/admin/reglages" routerLinkActive="on"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10M16 5v4M8 15v4"/></svg>Réglages</a> }
        </nav>
        <div class="adm-foot">
          <a class="adm-shop" href="/" target="_blank" rel="noopener">Voir la boutique
            <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg></a>
          <button type="button" class="bell-btn" [class.ring]="counters.ringing()" (click)="counters.toggleSound(); $event.stopPropagation()" [attr.aria-pressed]="counters.soundEnabled()">{{ counters.soundEnabled() ? '🔔 Son activé' : '🔕 Son coupé' }}</button>
          <div class="adm-user">
            <span class="adm-avatar" aria-hidden="true">{{ (auth.user()?.name || '?').charAt(0) }}</span>
            <span class="small">{{ auth.user()?.name }}<br /><span class="adm-role">{{ auth.user()?.roleName }}</span></span>
          </div>
          <button class="btn ghost sm" type="button" (click)="logout()">Déconnexion</button>
        </div>
      </aside>
      <main class="adm-main"><router-outlet /></main>
    </div>`,
})
export class AdminShell implements OnInit, OnDestroy {
  auth = inject(AuthService);
  cfg = inject(ConfigService);
  counters = inject(AdminCountersService);
  private router = inject(Router);
  menu = signal(false);
  c = this.counters.counters;
  ngOnInit() { this.counters.start(); }
  ngOnDestroy() { this.counters.stop(); }
  async logout() { this.counters.stop(); await this.auth.logout(); await this.router.navigate(['/admin/login']); }
}
