import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { Category, Paged, ProductCard } from '../../core/models';
import { ProductCardComponent } from '../../shared/product-card';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ProductCardComponent],
  template: `
    <section class="hero">
      <div class="container hero-in">
        <div>
          <h1>{{ cfg.shopName() }}</h1>
          <p class="lead">Choisissez vos articles, confirmez votre commande en deux minutes : nous vous recontactons pour la livraison ou le retrait.</p>
          <div class="row gap wrap"><a routerLink="/catalogue" class="btn">Voir le catalogue</a><a routerLink="/suivi" class="btn ghost">Suivre ma commande</a></div>
        </div>
        <ol class="hero-steps" aria-label="Comment commander">
          <li><strong>Je choisis</strong><span>mes articles, ma taille ou ma couleur</span></li>
          <li><strong>Je confirme</strong><span>mes coordonnées de livraison</span></li>
          <li><strong>Je suis ma commande</strong><span>le statut s'affiche en direct</span></li>
        </ol>
      </div>
    </section>

    @if (categories().length) {
      <section class="section"><div class="container">
        <h2>Catégories</h2>
        <div class="chips">
          @for (c of categories(); track c.id) { <a class="chip" [routerLink]="['/catalogue']" [queryParams]="{category: c.slug}">{{ c.name }} <span class="muted">{{ c.productCount }}</span></a> }
        </div>
      </div></section>
    }

    <section class="section"><div class="container">
      <div class="row between wrap"><h2>Nouveautés</h2><a routerLink="/catalogue">Tout voir</a></div>
      @if (loading()) { <div class="pgrid">@for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:340px"></div> }</div> }
      @else if (error()) { <div class="notice error">{{ error() }}</div> }
      @else if (!products().length) { <div class="empty"><h3>Le catalogue est en cours de préparation</h3><p>Revenez bientôt.</p></div> }
      @else { <div class="pgrid">@for (p of products(); track p.id) { <app-product-card [p]="p" /> }</div> }
    </div></section>`,
})
export class Home implements OnInit {
  private api = inject(ApiService);
  cfg = inject(ConfigService);
  products = signal<ProductCard[]>([]);
  categories = signal<Category[]>([]);
  loading = signal(true);
  error = signal('');
  async ngOnInit() {
    try {
      const [p, c] = await Promise.all([
        this.api.get<Paged<ProductCard>>('/products', { limit: 8, sort: 'newest' }),
        this.api.get<{ items: Category[] }>('/categories'),
      ]);
      this.products.set(p.items); this.categories.set(c.items.filter((x) => x.productCount > 0));
    } catch { this.error.set('Impossible de charger le catalogue pour le moment.'); }
    this.loading.set(false);
  }
}
