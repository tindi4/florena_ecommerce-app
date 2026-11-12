import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Category, Paged, ProductCard } from '../../core/models';
import { ProductCardComponent } from '../../shared/product-card';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [ProductCardComponent],
  template: `
    <div class="container section">
      <header class="page-head"><span class="eyebrow">Sacs, chaussures, vêtements</span><h1>Le catalogue</h1></header>
      <div class="filters">
        <div class="field search-field"><label class="sr-only" for="s">Recherche</label>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.500-3.500"/></svg>
          <input id="s" class="input" type="search" #s [value]="search()" (keyup.enter)="apply({search: s.value})" (blur)="apply({search: s.value})" placeholder="Que recherchez-vous ?" maxlength="80" /></div>
        <div class="field"><label class="sr-only" for="c">Catégorie</label>
          <select id="c" class="input" (change)="apply({category: $any($event.target).value})">
            <option value="" [selected]="!category()">Toutes les catégories</option>
            @for (c of categories(); track c.id) { <option [value]="c.slug" [selected]="c.slug === category()">{{ c.name }} ({{ c.productCount }})</option> }
          </select></div>
        <div class="field"><label class="sr-only" for="o">Trier par</label>
          <select id="o" class="input" (change)="apply({sort: $any($event.target).value})">
            <option value="newest" [selected]="sort() === 'newest'">Nouveautés</option>
            <option value="price_asc" [selected]="sort() === 'price_asc'">Prix croissant</option>
            <option value="price_desc" [selected]="sort() === 'price_desc'">Prix décroissant</option>
          </select></div>
      </div>

      @if (loading()) { <div class="pgrid">@for (i of [1,2,3,4,5,6,7,8]; track i) { <div class="skeleton" style="height:340px"></div> }</div> }
      @else if (error()) { <div class="notice error">{{ error() }} <button class="link-btn" (click)="load()">Réessayer</button></div> }
      @else if (!data()?.items?.length) {
        <div class="empty"><h3>Aucun produit trouvé</h3><p>Essayez un autre mot-clé ou retirez les filtres.</p><button class="btn ghost" (click)="reset()">Réinitialiser les filtres</button></div>
      } @else {
        <p class="muted small" aria-live="polite">{{ data()!.total }} produit{{ data()!.total > 1 ? 's' : '' }}</p>
        <div class="pgrid">@for (p of data()!.items; track p.id) { <app-product-card [p]="p" /> }</div>
        @if (data()!.totalPages > 1) {
          <nav class="pagination" aria-label="Pagination">
            <button class="btn ghost sm" [disabled]="page() <= 1" (click)="go(page() - 1)">Précédent</button>
            <span>Page {{ page() }} / {{ data()!.totalPages }}</span>
            <button class="btn ghost sm" [disabled]="page() >= data()!.totalPages" (click)="go(page() + 1)">Suivant</button>
          </nav>
        }
      }
    </div>`,
})
export class Catalog implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  data = signal<Paged<ProductCard> | null>(null);
  categories = signal<Category[]>([]);
  loading = signal(true);
  error = signal('');
  search = signal(''); category = signal(''); sort = signal('newest'); page = signal(1);

  async ngOnInit() {
    this.api.get<{ items: Category[] }>('/categories').then((r) => this.categories.set(r.items)).catch(() => {});
    this.route.queryParamMap.subscribe((q) => {
      this.search.set(q.get('search') ?? ''); this.category.set(q.get('category') ?? '');
      this.sort.set(q.get('sort') ?? 'newest'); this.page.set(Number(q.get('page')) || 1);
      this.load();
    });
  }
  async load() {
    this.loading.set(true); this.error.set('');
    try { this.data.set(await this.api.get<Paged<ProductCard>>('/products', { search: this.search(), category: this.category(), sort: this.sort(), page: this.page(), limit: 12 })); }
    catch { this.error.set('Impossible de charger les produits.'); }
    this.loading.set(false);
  }
  apply(p: Record<string, string>) {
    const next = { search: this.search(), category: this.category(), sort: this.sort(), ...p, page: null as any };
    if (Object.keys(p).every((k) => (next as any)[k] === (this as any)[k]())) return;
    this.router.navigate([], { queryParams: { search: next.search || null, category: next.category || null, sort: next.sort === 'newest' ? null : next.sort, page: null } });
  }
  go(page: number) { this.router.navigate([], { queryParams: { page: page > 1 ? page : null }, queryParamsHandling: 'merge' }); }
  reset() { this.router.navigate([], { queryParams: {} }); }
}
