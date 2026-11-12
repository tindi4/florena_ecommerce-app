import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { AdminCategory, Paged, StockRow } from '../../core/models';
import { AttrsPipe } from '../../shared/pipes';

interface Move { id: number; type: string; before: number | null; after: number | null; delta: number; reason: string | null; admin: string | null; at: string; }
/** Un article et ses déclinaisons (une ligne de la liste, à déplier). */
interface Group { productId: number; name: string; category: string | null; rows: StockRow[]; total: number; out: number; low: number; }
/** Motifs proposés : « add » ajoute au stock, « remove » retire, « set » remplace par la quantité comptée. */
const REASONS = [
  { key: 'reception', label: 'Réception de marchandise', mode: 'add', qty: 'Quantité reçue' },
  { key: 'retour', label: 'Retour d\'un client', mode: 'add', qty: 'Quantité rendue' },
  { key: 'inventaire', label: 'Correction après inventaire', mode: 'set', qty: 'Stock compté' },
  { key: 'perte', label: 'Casse ou perte', mode: 'remove', qty: 'Quantité retirée' },
] as const;
type ReasonKey = typeof REASONS[number]['key'];

@Component({
  selector: 'app-admin-stock',
  standalone: true,
  imports: [AttrsPipe, DatePipe],
  template: `
    <div class="adm-head"><h1>Stock</h1><p class="muted">Un article par ligne. Cliquez dessus pour voir ses tailles, pointures ou couleurs et ajuster les quantités.</p></div>
    <div class="tabs" role="tablist">
      <button role="tab" class="tab" [class.on]="filter() === ''" (click)="setFilter('')">Tout</button>
      <button role="tab" class="tab" [class.on]="filter() === 'low'" (click)="setFilter('low')">Stock bas (5 ou moins)</button>
      <button role="tab" class="tab" [class.on]="filter() === 'out'" (click)="setFilter('out')">En rupture</button>
    </div>
    <div class="row gap wrap filters-row">
      <select class="input" style="max-width:220px" aria-label="Catégorie" (change)="categoryId.set($any($event.target).value); load()">
        <option value="">Toutes les catégories</option>
        @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
      </select>
      <input class="input" style="max-width:320px" type="search" placeholder="Rechercher un article par son nom…" #s (keyup.enter)="search.set(s.value); load()" (search)="search.set(s.value); load()" aria-label="Rechercher un article" />
    </div>

    @if (loading()) { <div class="spinner"></div> }
    @else if (!groups().length) {
      <div class="empty card"><h3>{{ filter() === 'out' ? 'Aucune rupture' : filter() === 'low' ? 'Aucun stock bas' : 'Aucun article' }}</h3><p>Rien ne correspond à ce filtre.</p></div>
    } @else {
      <p class="muted small">{{ groups().length }} article{{ groups().length > 1 ? 's' : '' }}</p>
      <div class="stock-list">
        @for (g of groups(); track g.productId) {
          <section class="stock-item" [class.open]="open() === g.productId">
            <button type="button" class="stock-head" (click)="toggle(g.productId)" [attr.aria-expanded]="open() === g.productId">
              <span class="stock-name"><strong>{{ g.name }}</strong><small>{{ g.category || 'Sans catégorie' }} · {{ g.rows.length }} {{ label(g) }}</small></span>
              @if (filter() === '' && g.out > 0) { <span class="badge pay-no">{{ g.out }} en rupture</span> }
              @if (filter() === '' && g.low > 0) { <span class="badge st-EN_ATTENTE">{{ g.low }} bientôt épuisée{{ g.low > 1 ? 's' : '' }}</span> }
              @if (filter() !== 'out') { <span class="stock-total"><strong>{{ g.total }}</strong><small>en stock</small></span> }
              <svg class="ico chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
            </button>
            @if (open() === g.productId) {
              <div class="stock-body">
                @for (r of g.rows; track r.variantId) {
                  <div class="stock-row">
                    <div class="stock-var">
                      <strong>{{ (r.attributes | attrs) || 'Modèle unique' }}</strong>
                      <span class="badge" [class.pay-no]="r.stock === 0" [class.st-EN_ATTENTE]="r.stock > 0 && r.stock <= 5" [class.pay-yes]="r.stock > 5">{{ r.stock }} en stock</span>
                    </div>
                    @if (editing() === r.variantId) {
                      <div class="stock-form">
                        <div class="field"><label [for]="'m' + r.variantId">Motif</label>
                          <select [id]="'m' + r.variantId" class="input" (change)="reason.set($any($event.target).value)">
                            @for (o of reasons; track o.key) { <option [value]="o.key" [selected]="reason() === o.key">{{ o.label }}</option> }
                          </select></div>
                        <div class="field"><label [for]="'q' + r.variantId">{{ current().qty }}</label>
                          <input [id]="'q' + r.variantId" class="input" type="number" min="0" step="1" [value]="qty()" (input)="qty.set($any($event.target).value)" /></div>
                        <div class="stock-result">Nouveau stock<strong>{{ preview(r) ?? '—' }}</strong></div>
                        <div class="row gap"><button class="btn sm" type="button" (click)="save(r)" [disabled]="saving()">Valider</button><button class="btn ghost sm" type="button" (click)="editing.set(null)">Annuler</button></div>
                      </div>
                    } @else {
                      <div class="row gap wrap">
                        <button class="btn ghost sm" type="button" (click)="startEdit(r)">Ajuster le stock</button>
                        <button class="link-btn small" type="button" (click)="history(r)">Historique</button>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </section>
        }
      </div>
    }
    @if (hist(); as h) {
      <div class="modal-backdrop" (click)="hist.set(null)"><div class="modal" style="width:min(560px,100%)" (click)="$event.stopPropagation()">
        <h2>Historique du stock</h2>
        <p class="muted small">{{ h.productName }}@if (h.attributes | attrs; as a) { · {{ a }} }</p>
        @if (!moves().length) { <p class="muted">Aucun mouvement.</p> }
        <ul class="timeline">@for (m of moves(); track m.id) { <li><strong>{{ m.delta > 0 ? '+' : '' }}{{ m.delta }}</strong> → {{ m.after }}<div class="muted small">{{ m.at | date:'d MMM yyyy, HH:mm' }} · {{ m.admin || 'Commande' }}@if (m.reason) { · {{ m.reason }} }</div></li> }</ul>
        <button class="btn ghost" (click)="hist.set(null)">Fermer</button>
      </div></div>
    }`,
})
export class AdminStock implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private route = inject(ActivatedRoute);
  reasons = REASONS;
  rows = signal<StockRow[]>([]);
  categories = signal<AdminCategory[]>([]);
  loading = signal(true); saving = signal(false);
  filter = signal<'' | 'low' | 'out'>('');
  search = signal(''); categoryId = signal('');
  open = signal<number | null>(null);
  editing = signal<number | null>(null);
  reason = signal<ReasonKey>('reception');
  qty = signal('');
  hist = signal<StockRow | null>(null);
  moves = signal<Move[]>([]);

  /** Regroupe les déclinaisons par article, dans l'ordre alphabétique des articles. */
  groups = computed<Group[]>(() => {
    const map = new Map<number, Group>();
    for (const r of this.rows()) {
      let g = map.get(r.productId);
      if (!g) { g = { productId: r.productId, name: r.productName, category: r.category ?? null, rows: [], total: 0, out: 0, low: 0 }; map.set(r.productId, g); }
      g.rows.push(r); g.total += r.stock;
      if (r.isActive && r.stock === 0) g.out++; else if (r.isActive && r.stock <= 5) g.low++;
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  });
  current = computed(() => REASONS.find((o) => o.key === this.reason())!);

  ngOnInit() {
    const f = this.route.snapshot.queryParamMap.get('filter'); if (f === 'out' || f === 'low') this.filter.set(f);
    this.api.get<{ items: AdminCategory[] }>('/admin/categories').then((r) => this.categories.set(r.items)).catch(() => {});
    this.load();
  }
  setFilter(f: '' | 'low' | 'out') { this.filter.set(f); this.load(); }
  toggle(id: number) { this.open.set(this.open() === id ? null : id); this.editing.set(null); }
  label(g: Group) {
    const many = g.rows.length > 1;
    if (this.filter() === 'out') return `déclinaison${many ? 's' : ''} en rupture`;
    if (this.filter() === 'low') return `déclinaison${many ? 's' : ''} bientôt épuisée${many ? 's' : ''}`;
    return `déclinaison${many ? 's' : ''}`;
  }

  /** Charge toutes les déclinaisons du filtre (par pages de 100) pour pouvoir les regrouper par article. */
  async load() {
    this.loading.set(true); this.editing.set(null);
    try {
      const all: StockRow[] = [];
      for (let page = 1; page <= 30; page++) {
        const r = await this.api.get<Paged<StockRow>>('/admin/stock', { filter: this.filter(), search: this.search(), categoryId: this.categoryId(), limit: 100, page });
        all.push(...r.items);
        if (page >= r.totalPages) break;
      }
      this.rows.set(all);
      if (this.groups().length === 1) this.open.set(this.groups()[0].productId);
    } catch { /* 401 géré par l'intercepteur */ }
    this.loading.set(false);
  }

  startEdit(r: StockRow) { this.editing.set(r.variantId); this.reason.set('reception'); this.qty.set(''); }
  /** Stock obtenu une fois le mouvement validé (null tant que la quantité saisie n'est pas valable). */
  preview(r: StockRow): number | null {
    if (this.qty() === '') return null;
    const q = Number(this.qty());
    if (!Number.isInteger(q) || q < 0) return null;
    const mode = this.current().mode;
    return mode === 'add' ? r.stock + q : mode === 'remove' ? Math.max(0, r.stock - q) : q;
  }
  async save(r: StockRow) {
    const next = this.preview(r);
    if (next === null) { this.toast.error('Indiquez une quantité entière, positive ou nulle.'); return; }
    if (next === r.stock) { this.toast.error('Le stock ne change pas : vérifiez la quantité.'); return; }
    this.saving.set(true);
    try {
      await this.api.post(`/admin/variants/${r.variantId}/stock`, { quantity: next, reason: this.current().label });
      this.rows.update((list) => list.map((x) => (x.variantId === r.variantId ? { ...x, stock: next } : x)));
      this.editing.set(null); this.toast.success(`Stock mis à jour : ${next}.`);
    } catch (e) { this.toast.error(toApiError(e).message); }
    this.saving.set(false);
  }
  async history(r: StockRow) {
    this.hist.set(r);
    try { this.moves.set((await this.api.get<{ items: Move[] }>(`/admin/variants/${r.variantId}/stock-history`)).items); } catch { this.moves.set([]); }
  }
}
