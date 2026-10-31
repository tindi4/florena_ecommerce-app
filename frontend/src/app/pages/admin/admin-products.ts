import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { AdminCategory, AdminProductRow, Paged } from '../../core/models';
import { ImgPipe, MoneyPipe } from '../../shared/pipes';
import { ConfirmDialog } from '../../shared/confirm-dialog';

@Component({
  selector: 'app-admin-products',
  standalone: true,
  imports: [RouterLink, MoneyPipe, ImgPipe, ConfirmDialog],
  template: `
    <div class="row between wrap gap"><h1>Produits</h1><a class="btn" routerLink="/admin/produits/nouveau">Ajouter un produit</a></div>
    <div class="row gap wrap filters-row">
      <input class="input" style="max-width:260px" type="search" placeholder="Nom ou SKU" #s (keyup.enter)="search.set(s.value); page.set(1); load()" aria-label="Rechercher" />
      <select class="input" style="max-width:220px" aria-label="Catégorie" (change)="categoryId.set($any($event.target).value); page.set(1); load()">
        <option value="">Toutes les catégories</option>
        @for (c of categories(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
      </select>
      <select class="input" style="max-width:160px" aria-label="État" (change)="active.set($any($event.target).value); page.set(1); load()">
        <option value="">Tous</option><option value="true">Actifs</option><option value="false">Désactivés</option>
      </select>
    </div>
    @if (loading()) { <div class="spinner"></div> }
    @else if (!data()?.items?.length) { <div class="empty card"><h3>Aucun produit</h3><p>Ajoutez votre premier produit pour remplir la boutique.</p><a class="btn" routerLink="/admin/produits/nouveau">Ajouter un produit</a></div> }
    @else {
      <div class="card"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Produit</th><th>Catégorie</th><th class="num">Prix</th><th class="num">Stock</th><th>État</th><th></th></tr></thead>
        <tbody>@for (p of data()!.items; track p.id) {
          <tr [class.off]="!p.isActive"><td><div class="row gap"><div class="thumb-sm">@if (p.imageUrl) { <img [src]="p.imageUrl | img" alt="" /> } @else { <div class="ph">{{ p.name.charAt(0) }}</div> }</div>
            <div><a [routerLink]="['/admin/produits', p.id]"><strong>{{ p.name }}</strong></a><div class="muted small">{{ p.variantCount }} variante{{ p.variantCount > 1 ? 's' : '' }}</div></div></div></td>
            <td>{{ p.category || '—' }}</td><td class="num">{{ p.priceMin | money }}</td>
            <td class="num"><span [class.err]="p.totalStock === 0">{{ p.totalStock }}</span></td>
            <td><span class="badge" [class.pay-yes]="p.isActive">{{ p.isActive ? 'Actif' : 'Désactivé' }}</span></td>
            <td class="num"><a class="btn sm ghost" [routerLink]="['/admin/produits', p.id]">Modifier</a>
              <button class="btn sm" [class.danger-ghost]="p.isActive" [class.ghost]="!p.isActive" (click)="p.isActive ? ask.set(p) : toggle(p, true)">{{ p.isActive ? 'Désactiver' : 'Réactiver' }}</button></td></tr>
        }</tbody></table></div></div>
      @if (data()!.totalPages > 1) { <nav class="pagination"><button class="btn ghost sm" [disabled]="page() <= 1" (click)="page.set(page() - 1); load()">Précédent</button><span>Page {{ page() }} / {{ data()!.totalPages }}</span><button class="btn ghost sm" [disabled]="page() >= data()!.totalPages" (click)="page.set(page() + 1); load()">Suivant</button></nav> }
    }
    @if (ask(); as p) { <app-confirm title="Désactiver ce produit ?" [message]="'« ' + p.name + ' » ne sera plus visible dans la boutique. Les commandes passées sont conservées. Vous pourrez le réactiver.'" confirmLabel="Désactiver" [danger]="true" (confirm)="toggle(p, false); ask.set(null)" (cancel)="ask.set(null)" /> }`,
})
export class AdminProducts implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  data = signal<Paged<AdminProductRow> | null>(null);
  categories = signal<AdminCategory[]>([]);
  loading = signal(true);
  search = signal(''); categoryId = signal(''); active = signal(''); page = signal(1);
  ask = signal<AdminProductRow | null>(null);
  async ngOnInit() {
    this.api.get<{ items: AdminCategory[] }>('/admin/categories').then((r) => this.categories.set(r.items)).catch(() => {});
    this.load();
  }
  async load() {
    this.loading.set(true);
    try { this.data.set(await this.api.get<Paged<AdminProductRow>>('/admin/products', { search: this.search(), categoryId: this.categoryId(), active: this.active(), page: this.page() })); } catch { /* ignore */ }
    this.loading.set(false);
  }
  async toggle(p: AdminProductRow, isActive: boolean) {
    try { await this.api.patch(`/admin/products/${p.id}/active`, { isActive }); this.toast.success(isActive ? 'Produit réactivé.' : 'Produit désactivé.'); this.load(); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }
}
