import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Counters, OrderStatus, PaymentStatus } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';

interface Dashboard extends Counters {
  counts: { enAttente: number; confirmee: number; enPreparation: number; terminee: number; annulee: number; outOfStock: number };
  latestOrders: { id: number; orderNumber: string; customerName: string; status: OrderStatus; paymentStatus: PaymentStatus; total: number; currency: string; createdAt: string }[];
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadge, PayBadge],
  template: `
    <h1>Tableau de bord</h1>
    @if (loading()) { <div class="spinner"></div> }
    @else if (d(); as d) {
      <div class="kpis">
        <a class="kpi hot" routerLink="/admin/commandes" [queryParams]="{status: 'EN_ATTENTE'}"><strong>{{ d.counts.enAttente }}</strong><span>En attente</span></a>
        <a class="kpi" routerLink="/admin/commandes" [queryParams]="{status: 'CONFIRMEE'}"><strong>{{ d.counts.confirmee }}</strong><span>Confirmées</span></a>
        <a class="kpi" routerLink="/admin/commandes" [queryParams]="{status: 'EN_PREPARATION'}"><strong>{{ d.counts.enPreparation }}</strong><span>En préparation</span></a>
        <a class="kpi" routerLink="/admin/commandes" [queryParams]="{view: 'done'}"><strong>{{ d.counts.terminee }}</strong><span>Terminées</span></a>
        <a class="kpi warn" routerLink="/admin/commandes" [queryParams]="{payment: 'unpaid'}"><strong>{{ d.unpaidOrders }}</strong><span>Non payées</span></a>
        <a class="kpi warn" routerLink="/admin/stock" [queryParams]="{filter: 'out'}"><strong>{{ d.counts.outOfStock }}</strong><span>Variantes en rupture</span></a>
        <a class="kpi" routerLink="/admin/messages"><strong>{{ d.newMessages }}</strong><span>Messages à traiter</span></a>
      </div>
      <div class="card mt">
        <div class="row between"><h2>Dernières commandes</h2><a routerLink="/admin/commandes">Tout voir</a></div>
        @if (!d.latestOrders.length) { <div class="empty"><p>Aucune commande pour le moment.</p></div> }
        @else {
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>N°</th><th>Client</th><th>Date</th><th>Statut</th><th>Paiement</th><th class="num">Total</th></tr></thead>
            <tbody>@for (o of d.latestOrders; track o.id) {
              <tr><td><a [routerLink]="['/admin/commandes', o.id]">{{ o.orderNumber }}</a></td><td>{{ o.customerName }}</td><td>{{ o.createdAt | date:'dd/MM HH:mm' }}</td>
                <td><app-status-badge [status]="o.status" /></td><td><app-pay-badge [paid]="o.paymentStatus" /></td><td class="num">{{ o.total | money:o.currency }}</td></tr>
            }</tbody></table></div>
        }
      </div>
    }`,
})
export class AdminDashboard implements OnInit {
  private api = inject(ApiService);
  d = signal<Dashboard | null>(null);
  loading = signal(true);
  async ngOnInit() { try { this.d.set(await this.api.get<Dashboard>('/admin/dashboard')); } catch { /* 401 géré */ } this.loading.set(false); }
}
