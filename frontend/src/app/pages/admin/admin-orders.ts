import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AdminCountersService } from '../../core/admin-counters.service';
import { AdminOrderRow, Paged } from '../../core/models';
import { MoneyPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';

const VIEWS = [
  { key: 'todo', label: 'À traiter' },
  { key: 'done', label: 'Terminées' },
  { key: 'cancelled', label: 'Annulées' },
  { key: 'all', label: 'Toutes' },
];

@Component({
  selector: 'app-admin-orders',
  standalone: true,
  imports: [RouterLink, DatePipe, MoneyPipe, StatusBadge, PayBadge],
  template: `
    <h1>Commandes</h1>
    <div class="tabs" role="tablist">
      @for (v of views; track v.key) { <button role="tab" class="tab" [class.on]="view() === v.key && !status()" [attr.aria-selected]="view() === v.key && !status()" (click)="setView(v.key)">{{ v.label }}</button> }
    </div>
    <div class="row gap wrap filters-row">
      <input class="input" style="max-width:280px" type="search" placeholder="N°, nom ou téléphone" #s [value]="search()" (keyup.enter)="apply({search: s.value})" aria-label="Rechercher" />
      <select class="input" style="max-width:200px" aria-label="Paiement" (change)="apply({payment: $any($event.target).value})">
        <option value="" [selected]="!payment()">Tous les paiements</option>
        <option value="unpaid" [selected]="payment() === 'unpaid'">Non payées</option>
        <option value="paid" [selected]="payment() === 'paid'">Payées</option>
      </select>
      @if (status()) { <button class="btn ghost sm" (click)="apply({status: ''})">Statut : {{ status() }} ✕</button> }
    </div>

    @if (loading()) { <div class="spinner"></div> }
    @else if (!data()?.items?.length) {
      <div class="empty card"><h3>{{ view() === 'todo' ? 'Rien à traiter 🎉' : 'Aucune commande' }}</h3><p>{{ view() === 'todo' ? 'Toutes les commandes en cours sont traitées.' : 'Aucune commande ne correspond à cette vue.' }}</p></div>
    } @else {
      <div class="olist">
        @for (o of data()!.items; track o.id) {
          <a class="ocard" [routerLink]="['/admin/commandes', o.id]" [class.is-new]="o.isNew">
            <div class="ocard-top">
              <strong>{{ o.orderNumber }}</strong>
              @if (o.isNew) { <span class="badge new">Nouvelle</span> }
              <span class="muted small">{{ o.createdAt | date:'dd/MM/yyyy HH:mm' }}</span>
            </div>
            <div class="ocard-mid"><span>{{ o.customerName }}</span><span class="muted">{{ o.customerPhone }}</span></div>
            <div class="ocard-bot">
              <span class="muted small">{{ o.itemCount }} article{{ o.itemCount > 1 ? 's' : '' }}</span>
              <strong>{{ o.total | money:o.currency }}</strong>
              <app-status-badge [status]="o.status" /><app-pay-badge [paid]="o.paymentStatus" />
            </div>
          </a>
        }
      </div>
      @if (data()!.totalPages > 1) {
        <nav class="pagination"><button class="btn ghost sm" [disabled]="page() <= 1" (click)="go(page() - 1)">Précédent</button><span>Page {{ page() }} / {{ data()!.totalPages }}</span><button class="btn ghost sm" [disabled]="page() >= data()!.totalPages" (click)="go(page() + 1)">Suivant</button></nav>
      }
    }`,
})
export class AdminOrders implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private counters = inject(AdminCountersService);
  views = VIEWS;
  data = signal<Paged<AdminOrderRow> | null>(null);
  loading = signal(true);
  view = signal('todo'); status = signal(''); payment = signal(''); search = signal(''); page = signal(1);
  private timer: any;

  ngOnInit() {
    this.route.queryParamMap.subscribe((q) => {
      this.view.set(q.get('view') ?? 'todo'); this.status.set(q.get('status') ?? ''); this.payment.set(q.get('payment') ?? '');
      this.search.set(q.get('search') ?? ''); this.page.set(Number(q.get('page')) || 1);
      if (this.status()) this.view.set('all');
      this.load(true);
    });
    this.timer = setInterval(() => this.load(false), 20000);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  async load(spinner: boolean) {
    if (spinner) this.loading.set(true);
    try { this.data.set(await this.api.get<Paged<AdminOrderRow>>('/admin/orders', { view: this.view(), status: this.status(), payment: this.payment(), search: this.search(), page: this.page() })); this.counters.refresh(); } catch { /* ignore */ }
    this.loading.set(false);
  }
  setView(v: string) { this.router.navigate([], { queryParams: { view: v === 'todo' ? null : v, status: null, page: null }, queryParamsHandling: 'merge' }); }
  apply(p: Record<string, string>) { this.router.navigate([], { queryParams: { ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v || null])), page: null }, queryParamsHandling: 'merge' }); }
  go(p: number) { this.router.navigate([], { queryParams: { page: p > 1 ? p : null }, queryParamsHandling: 'merge' }); }
}
