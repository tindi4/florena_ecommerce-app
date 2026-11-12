import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, toApiError } from '../../core/api.service';
import { Stats } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { saveBlob } from '../../core/utils';
import { MoneyPipe } from '../../shared/pipes';

const iso = (d: Date) => d.toISOString().slice(0, 10);
type Range = '10' | '20' | '30' | 'all' | 'custom';

@Component({
  selector: 'app-admin-stats',
  standalone: true,
  imports: [MoneyPipe, DatePipe],
  template: `
    <div class="row between wrap gap adm-head">
      <div><h1>Statistiques</h1><p class="muted">L'essentiel d'abord, le détail quand vous le demandez.</p></div>
      <button class="btn ghost sm" (click)="exportCsv()" [disabled]="!data()">Exporter la période (CSV)</button>
    </div>

    <!-- 1. Les totaux depuis l'ouverture de la boutique -->
    <h2 class="adm-sec">Depuis l'ouverture</h2>
    @if (overall(); as o) {
      <div class="stats">
        <div class="stat"><span>Chiffre d'affaires total</span><strong>{{ o.totals.revenue | money:o.currency }}</strong></div>
        <div class="stat"><span>Encaissé total</span><strong>{{ o.totals.cash | money:o.currency }}</strong></div>
        <div class="stat warn"><span>Reste à encaisser</span><strong>{{ o.totals.unpaidAmount | money:o.currency }}</strong><small>{{ o.totals.unpaidCount }} commande{{ o.totals.unpaidCount > 1 ? 's' : '' }}</small></div>
        <div class="stat"><span>Commandes totales</span><strong>{{ o.totals.orders }}</strong></div>
      </div>
      <p class="stat-today">Aujourd'hui : {{ o.today.orders }} commande{{ o.today.orders > 1 ? 's' : '' }} · {{ o.today.revenue | money:o.currency }} de chiffre d'affaires · {{ o.today.cash | money:o.currency }} encaissés</p>
    } @else if (!loading()) { <p class="muted">Totaux indisponibles pour le moment.</p> }

    <!-- 2. Le détail d'une période, au choix -->
    <div class="period-bar">
      <label for="per">Afficher les informations</label>
      <select id="per" class="input" (change)="setRange($any($event.target).value)">
        @for (r of ranges; track r.key) { <option [value]="r.key" [selected]="range() === r.key">{{ r.label }}</option> }
      </select>
      @if (range() === 'custom') {
        <label class="sr-only" for="f">Du</label><input id="f" type="date" class="input" [value]="from()" (change)="from.set($any($event.target).value)" />
        <label class="sr-only" for="t">Au</label><input id="t" type="date" class="input" [value]="to()" (change)="to.set($any($event.target).value)" />
        <button class="btn sm" (click)="load()">Afficher</button>
      }
      @if (data(); as d) { <span class="period-dates">Du {{ d.range.from | date:'d MMMM' }} au {{ d.range.to | date:'d MMMM yyyy' }}</span> }
    </div>

    @if (loading()) { <div class="spinner"></div> }
    @else if (data(); as d) {
      <div class="stats small">
        <div class="stat"><span>Chiffre d'affaires</span><strong>{{ d.totals.revenue | money:d.currency }}</strong></div>
        <div class="stat"><span>Encaissé</span><strong>{{ d.totals.cash | money:d.currency }}</strong></div>
        <div class="stat"><span>Commandes</span><strong>{{ d.totals.orders }}</strong></div>
        <div class="stat"><span>Panier moyen</span><strong>{{ d.totals.averageBasket | money:d.currency }}</strong></div>
        <div class="stat"><span>Dont livraison</span><strong>{{ d.totals.delivery | money:d.currency }}</strong></div>
        <div class="stat"><span>Annulées</span><strong>{{ d.totals.cancelledCount }}</strong><small>{{ d.totals.cancelledAmount | money:d.currency }}</small></div>
      </div>

      <div class="card mt">
        <div class="row between wrap gap"><h2>Jour par jour</h2><div class="legend small"><span class="lg a"></span> Chiffre d'affaires <span class="lg b"></span> Encaissé</div></div>
        <div class="chart" role="img" aria-label="Chiffre d'affaires et encaissements par jour">
          @for (x of d.daily; track x.date) {
            <div class="col" [title]="(x.date | date:'dd/MM') + ' : CA ' + x.revenue + ' · encaissé ' + x.cash">
              <div class="bars"><span class="bar a" [style.height.%]="pct(x.revenue)"></span><span class="bar b" [style.height.%]="pct(x.cash)"></span></div>
              <span class="lbl">{{ x.date | date:'dd' }}</span>
            </div>
          }
        </div>
        <details class="more">
          <summary>Voir le tableau jour par jour</summary>
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Jour</th><th class="num">Commandes</th><th class="num">Chiffre d'affaires</th><th class="num">Encaissé</th></tr></thead>
            <tbody>@for (x of reversed(); track x.date) {
              <tr><td>{{ x.date | date:'EEE d MMM' }}</td><td class="num">{{ x.orders }}</td><td class="num">{{ x.revenue | money:d.currency }}</td><td class="num">{{ x.cash | money:d.currency }}</td></tr>
            }</tbody></table></div>
        </details>
      </div>

      <div class="card mt">
        <h2>Articles les plus vendus</h2>
        @if (!d.topProducts.length) { <p class="muted">Aucune vente sur cette période.</p> }
        @else {
          <ol class="top">
            @for (t of d.topProducts; track t.name) {
              <li><div class="row between gap"><span>{{ t.name }}</span><span class="muted small">{{ t.quantity }} vendu{{ t.quantity > 1 ? 's' : '' }} · {{ t.revenue | money:d.currency }}</span></div>
                <div class="meter"><span [style.width.%]="topPct(t.quantity)"></span></div></li>
            }
          </ol>
        }
      </div>
      <p class="hint">Chiffre d'affaires = commandes non annulées, au jour de la commande. Encaissé = commandes marquées « payées », au jour du paiement.</p>
    }`,
})
export class AdminStats implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  ranges: { key: Range; label: string }[] = [
    { key: '10', label: 'des 10 derniers jours' }, { key: '20', label: 'des 20 derniers jours' }, { key: '30', label: 'des 30 derniers jours' },
    { key: 'all', label: 'de toute la période' }, { key: 'custom', label: 'd\'une période au choix…' },
  ];
  range = signal<Range>('30');
  from = signal(iso(new Date(Date.now() - 29 * 86400000))); to = signal(iso(new Date()));
  /** Totaux depuis la toute première commande (affichés en haut de page). */
  overall = signal<Stats | null>(null);
  /** Détail de la période choisie dans le menu déroulant. */
  data = signal<Stats | null>(null);
  loading = signal(true);
  maxBar = computed(() => Math.max(1, ...(this.data()?.daily ?? []).flatMap((x) => [x.revenue, x.cash])));
  reversed = computed(() => [...(this.data()?.daily ?? [])].reverse());
  pct = (v: number) => Math.max(v > 0 ? 3 : 0, (v / this.maxBar()) * 100);
  topPct = (q: number) => (q / Math.max(1, ...(this.data()?.topProducts ?? []).map((t) => t.quantity))) * 100;

  ngOnInit() {
    this.api.get<Stats>('/admin/stats', { all: '1' }).then((s) => { this.overall.set(s); if (this.range() === 'all') this.data.set(s); }).catch(() => {});
    this.load();
  }
  setRange(r: Range) {
    this.range.set(r);
    if (r === 'custom') return;
    if (r !== 'all') { this.to.set(iso(new Date())); this.from.set(iso(new Date(Date.now() - (Number(r) - 1) * 86400000))); }
    this.load();
  }
  async load() {
    this.loading.set(true);
    try {
      const params = this.range() === 'all' ? { all: '1' } : { from: this.from(), to: this.to() };
      const s = await this.api.get<Stats>('/admin/stats', params);
      this.data.set(s); if (this.range() === 'all') this.overall.set(s);
    } catch (e) { this.toast.error(toApiError(e).message); }
    this.loading.set(false);
  }
  exportCsv() {
    const d = this.data(); if (!d) return;
    const rows = [['Date', 'Commandes', "Chiffre d'affaires", 'Encaissé'], ...d.daily.map((x) => [x.date, x.orders, x.revenue, x.cash])];
    saveBlob(new Blob(['﻿' + rows.map((r) => r.join(';')).join('\n')], { type: 'text/csv;charset=utf-8' }), `statistiques-${d.range.from}-${d.range.to}.csv`);
  }
}
