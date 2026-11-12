import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Counters, OrderStatus, PaymentStatus } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';

interface Dashboard extends Counters {
  counts: { enAttente: number; confirmee: number; enPreparation: number; terminee: number; annulee: number; outOfStock: number };
  latestOrders: { id: number; orderNumber: string; customerName: string | null; status: OrderStatus; paymentStatus: PaymentStatus; total: number; currency: string; createdAt: string }[];
}
interface Kpi { label: string; value: number; link: string; params: Record<string, string>; tone: string; icon: string; hot?: boolean; }

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadge, PayBadge],
  template: `
    <section class="adm-hero">
      <div class="adm-hero-txt">
        <span class="eyebrow">{{ today | date:'EEEE d MMMM yyyy' }}</span>
        <h1>Bonjour {{ auth.user()?.name }}</h1>
        <p>@if (d(); as d) {
          @if (d.counts.enAttente > 0) { {{ d.counts.enAttente }} commande{{ d.counts.enAttente > 1 ? 's attendent' : ' attend' }} votre confirmation. }
          @else { Tout est à jour : aucune commande en attente. }
        } @else { Voici où en est votre boutique aujourd'hui. }</p>
      </div>
      <img src="img/admin-welcome.svg" alt="" aria-hidden="true" />
    </section>

    <nav class="quick-cards" aria-label="Raccourcis">
      <a class="quick-card" routerLink="/admin/commandes">
        <span class="kpi-ico t-amber" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2" /></svg></span>
        <span><strong>Commandes à traiter</strong><small>Confirmer, préparer, encaisser</small></span>
      </a>
      @if (auth.can('products')) {
        <a class="quick-card" routerLink="/admin/produits/nouveau">
          <span class="kpi-ico t-teal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg></span>
          <span><strong>Nouvel article</strong><small>L'ajouter à la boutique en 4 étapes</small></span>
        </a>
      }
      @if (auth.can('stats')) {
        <a class="quick-card" routerLink="/admin/statistiques">
          <span class="kpi-ico t-violet" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></svg></span>
          <span><strong>Statistiques</strong><small>Chiffre d'affaires et encaissements</small></span>
        </a>
      }
    </nav>
    <h2 class="adm-sec">En ce moment</h2>

    @if (loading()) { <div class="spinner"></div> }
    @else if (d(); as d) {
      <div class="kpis">
        @for (k of kpis(); track k.label) {
          <a class="kpi" [class.hot]="k.hot && k.value > 0" [routerLink]="k.link" [queryParams]="k.params">
            <span [class]="'kpi-ico ' + k.tone" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="k.icon" /></svg></span>
            <span class="kpi-txt"><strong>{{ k.value }}</strong><span>{{ k.label }}</span></span>
          </a>
        }
      </div>
      <div class="card mt">
        <div class="row between"><h2>Dernières commandes</h2><a routerLink="/admin/commandes">Tout voir</a></div>
        @if (!d.latestOrders.length) { <div class="empty"><p>Aucune commande pour le moment.</p></div> }
        @else {
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Statut</th><th>Paiement</th><th class="num">Total</th></tr></thead>
            <tbody>@for (o of d.latestOrders; track o.id) {
              <tr><td><a [routerLink]="['/admin/commandes', o.id]">{{ o.orderNumber }}</a></td><td>{{ o.customerName || 'Client sans nom' }}</td><td>{{ o.createdAt | date:'dd/MM HH:mm' }}</td>
                <td><app-status-badge [status]="o.status" /></td><td><app-pay-badge [paid]="o.paymentStatus" /></td><td class="num">{{ o.total | money:o.currency }}</td></tr>
            }</tbody></table></div>
        }
      </div>
    }`,
})
export class AdminDashboard implements OnInit {
  private api = inject(ApiService);
  auth = inject(AuthService);
  today = new Date();
  d = signal<Dashboard | null>(null);
  loading = signal(true);
  kpis = computed<Kpi[]>(() => {
    const d = this.d(); if (!d) return [];
    const list: Kpi[] = [
      { label: 'En attente', value: d.counts.enAttente, link: '/admin/commandes', params: { status: 'EN_ATTENTE' }, tone: 't-amber', icon: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z', hot: true },
      { label: 'Confirmées', value: d.counts.confirmee, link: '/admin/commandes', params: { status: 'CONFIRMEE' }, tone: 't-blue', icon: 'm8 12 3 3 5-6M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
      { label: 'En préparation', value: d.counts.enPreparation, link: '/admin/commandes', params: { status: 'EN_PREPARATION' }, tone: 't-violet', icon: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9' },
      { label: 'Terminées', value: d.counts.terminee, link: '/admin/commandes', params: { view: 'done' }, tone: 't-green', icon: 'M5 8h14l-1 12H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2M9.5 14l2 2 3.500-4' },
      { label: 'Non payées', value: d.unpaidOrders, link: '/admin/commandes', params: { payment: 'unpaid' }, tone: 't-red', icon: 'M3 7h18v10H3zM3 11h18M7 15h3' },
      { label: 'Déclinaisons en rupture', value: d.counts.outOfStock, link: '/admin/stock', params: { filter: 'out' }, tone: 't-pink', icon: 'M12 9v4M12 17h.01M10.300 4.200 2.800 17a2 2 0 0 0 1.700 3h15a2 2 0 0 0 1.700-3L13.700 4.200a2 2 0 0 0-3.400 0Z' },
      { label: 'Messages à traiter', value: d.newMessages, link: '/admin/messages', params: {}, tone: 't-teal', icon: 'M21 12a8 8 0 0 1-11.8 7L3 21l2-5.5A8 8 0 1 1 21 12Z' },
    ];
    return list;
  });
  async ngOnInit() { try { this.d.set(await this.api.get<Dashboard>('/admin/dashboard')); } catch { /* 401 géré */ } this.loading.set(false); }
}
