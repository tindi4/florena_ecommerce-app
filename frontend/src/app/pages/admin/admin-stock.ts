import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { Paged, StockRow } from '../../core/models';
import { AttrsPipe } from '../../shared/pipes';

interface Move { id: number; type: string; before: number | null; after: number | null; delta: number; reason: string | null; admin: string | null; at: string; }

@Component({
  selector: 'app-admin-stock',
  standalone: true,
  imports: [AttrsPipe, DatePipe],
  template: `
    <h1>Stock</h1>
    <div class="tabs" role="tablist">
      <button role="tab" class="tab" [class.on]="filter() === ''" (click)="setFilter('')">Tout</button>
      <button role="tab" class="tab" [class.on]="filter() === 'low'" (click)="setFilter('low')">Stock bas (≤ 5)</button>
      <button role="tab" class="tab" [class.on]="filter() === 'out'" (click)="setFilter('out')">En rupture</button>
    </div>
    <input class="input filters-row" style="max-width:280px" type="search" placeholder="Produit ou SKU" #s (keyup.enter)="search.set(s.value); load()" aria-label="Rechercher" />
    @if (loading()) { <div class="spinner"></div> }
    @else if (!data()?.items?.length) { <div class="empty card"><h3>Aucune variante</h3><p>Rien ne correspond à ce filtre.</p></div> }
    @else {
      <div class="card"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Produit</th><th>Variante</th><th class="num">Stock</th><th>Nouveau stock</th><th></th></tr></thead>
        <tbody>@for (r of data()!.items; track r.variantId) {
          <tr><td><strong>{{ r.productName }}</strong></td><td class="small">{{ r.attributes | attrs }}@if (r.sku) { <div class="muted">SKU {{ r.sku }}</div> }</td>
            <td class="num"><span class="badge" [class.pay-no]="r.stock === 0" [class.st-EN_ATTENTE]="r.stock > 0 && r.stock <= 5">{{ r.stock }}</span></td>
            <td><div class="row gap"><input class="input" style="width:90px" type="number" min="0" step="1" [value]="r.stock" #q [attr.aria-label]="'Nouveau stock ' + r.productName" />
              <input class="input" style="width:180px" placeholder="Motif (ex. réception)" #m /><button class="btn sm" (click)="adjust(r, q.value, m.value, m)">Valider</button></div></td>
            <td><button class="link-btn small" (click)="history(r)">Historique</button></td></tr>
        }</tbody></table></div></div>
    }
    @if (hist(); as h) {
      <div class="modal-backdrop" (click)="hist.set(null)"><div class="modal" style="width:min(560px,100%)" (click)="$event.stopPropagation()">
        <h2>Historique du stock</h2>
        @if (!moves().length) { <p class="muted">Aucun mouvement.</p> }
        <ul class="timeline">@for (m of moves(); track m.id) { <li><strong>{{ m.delta > 0 ? '+' : '' }}{{ m.delta }}</strong> → {{ m.after }} <span class="muted small">({{ m.type }})</span><div class="muted small">{{ m.at | date:'dd/MM/yyyy HH:mm' }} · {{ m.admin || 'Système' }}@if (m.reason) { · {{ m.reason }} }</div></li> }</ul>
        <button class="btn ghost" (click)="hist.set(null)">Fermer</button>
      </div></div>
    }`,
})
export class AdminStock implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  data = signal<Paged<StockRow> | null>(null);
  loading = signal(true);
  filter = signal<'' | 'low' | 'out'>('');
  search = signal('');
  hist = signal<StockRow | null>(null);
  moves = signal<Move[]>([]);
  ngOnInit() { const f = this.route.snapshot.queryParamMap.get('filter'); if (f === 'out' || f === 'low') this.filter.set(f); this.load(); }
  setFilter(f: '' | 'low' | 'out') { this.filter.set(f); this.load(); }
  async load() {
    this.loading.set(true);
    try { this.data.set(await this.api.get<Paged<StockRow>>('/admin/stock', { filter: this.filter(), search: this.search(), limit: 50 })); } catch { /* ignore */ }
    this.loading.set(false);
  }
  async adjust(r: StockRow, qty: string, reason: string, reasonInput: HTMLInputElement) {
    const q = Number(qty);
    if (!Number.isInteger(q) || q < 0) { this.toast.error('Le stock doit être un entier positif ou nul.'); return; }
    if (reason.trim().length < 3) { this.toast.error('Indiquez un motif (3 caractères minimum).'); return; }
    try { await this.api.post(`/admin/variants/${r.variantId}/stock`, { quantity: q, reason: reason.trim() }); reasonInput.value = ''; this.toast.success('Stock mis à jour.'); this.load(); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }
  async history(r: StockRow) {
    this.hist.set(r);
    try { this.moves.set((await this.api.get<{ items: Move[] }>(`/admin/variants/${r.variantId}/stock-history`)).items); } catch { this.moves.set([]); }
  }
}
