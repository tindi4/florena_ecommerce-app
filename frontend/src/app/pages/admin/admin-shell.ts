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
    <div class="adm" [class.open]="menu()">
      <header class="adm-top">
        <button class="adm-burger" type="button" (click)="menu.set(!menu())" aria-label="Menu">☰</button>
        <strong class="adm-title">{{ cfg.shopName() }}</strong>
        <a class="adm-bell" routerLink="/admin/notifications" [attr.aria-label]="c().unreadNotifications + ' notifications non lues'">
          🔔 @if (c().unreadNotifications > 0) { <span class="bell-count">{{ c().unreadNotifications }}</span> }
        </a>
      </header>
      <aside class="adm-side" (click)="menu.set(false)">
        <div class="adm-brand">{{ cfg.shopName() }}<span>Administration</span></div>
        <nav aria-label="Administration">
          <a routerLink="/admin/dashboard" routerLinkActive="on">Tableau de bord</a>
          <a routerLink="/admin/commandes" routerLinkActive="on">Commandes @if (c().todoOrders > 0) { <span class="pill">{{ c().todoOrders }}</span> }</a>
          <a routerLink="/admin/notifications" routerLinkActive="on">Notifications @if (c().unreadNotifications > 0) { <span class="pill hot">{{ c().unreadNotifications }}</span> }</a>
          <a routerLink="/admin/messages" routerLinkActive="on">Messages @if (c().newMessages > 0) { <span class="pill hot">{{ c().newMessages }}</span> }</a>
          <a routerLink="/admin/produits" routerLinkActive="on">Produits</a>
          <a routerLink="/admin/categories" routerLinkActive="on">Catégories</a>
          <a routerLink="/admin/stock" routerLinkActive="on">Stock</a>
        </nav>
        <div class="adm-foot">
          <a href="/" target="_blank" rel="noopener">Voir la boutique</a>
          <span class="small">{{ auth.user()?.name }}</span>
          <button class="btn ghost sm" type="button" (click)="logout()">Déconnexion</button>
        </div>
      </aside>
      <main class="adm-main"><router-outlet /></main>
    </div>`,
})
export class AdminShell implements OnInit, OnDestroy {
  auth = inject(AuthService);
  cfg = inject(ConfigService);
  private counters = inject(AdminCountersService);
  private router = inject(Router);
  menu = signal(false);
  c = this.counters.counters;
  ngOnInit() { this.counters.start(); }
  ngOnDestroy() { this.counters.stop(); }
  async logout() { this.counters.stop(); await this.auth.logout(); await this.router.navigate(['/admin/login']); }
}
