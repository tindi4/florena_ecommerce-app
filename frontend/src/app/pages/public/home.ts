import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { Category, Paged, ProductCard } from '../../core/models';
import { ProductCardComponent } from '../../shared/product-card';

/** Les trois univers de la boutique : `key` sert à retrouver la catégorie correspondante (par son slug).
 * Avec plusieurs images, la vignette les fait défiler en fondu. */
const UNIVERS = [
  { key: 'sac', name: 'Sacs', line: 'Le détail qui signe une tenue', imgs: ['img/univers-sacs.jpg'] },
  { key: 'chaussure', name: 'Chaussures', line: 'De l\'allure à chaque pas', imgs: ['img/univers-chaussures-1.jpg', 'img/univers-chaussures-2.jpg'] },
  { key: 'vetement', name: 'Vêtements', line: 'Des coupes justes, des matières douces', imgs: ['img/univers-vetements.jpg'] },
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ProductCardComponent],
  template: `
    <section class="hero">
      <div class="hero-visual" aria-hidden="true"><img src="img/hero-still.svg" alt="" /></div>
      <div class="container hero-in">
        <div>
          <span class="eyebrow"><span class="dot" aria-hidden="true"></span>Nouvelle collection</span>
          <h1>{{ cfg.shopName() }}<span>Jusque dans les détails.</span></h1>
          <p class="lead">Sacs, chaussures et vêtements choisis un à un, pour composer une silhouette qui vous ressemble.</p>
          <a routerLink="/catalogue" class="btn">Découvrir la collection
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M8 7h9v9"/></svg>
          </a>
          <ol class="hero-steps" aria-label="Comment commander">
            <li><b>01</b>Je choisis</li>
            <li><b>02</b>Je confirme</li>
            <li><b>03</b>Je suis ma commande</li>
          </ol>
        </div>
      </div>
    </section>

    <section class="trust" aria-label="Nos engagements">
      <div class="container trust-in">
        <div class="trust-item"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="m8 12 3 3 5-6"/></svg><div><strong>Suivi en direct</strong><span>Chaque étape de votre commande, en temps réel</span></div></div>
        <div class="trust-item"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg><div><strong>Livraison sur demande</strong><span>Chez vous, ou en retrait à la boutique</span></div></div>
        <div class="trust-item"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.5 3.200 8 7.500 9.500 4.300-1.500 7.500-5 7.500-9.500V6L12 3Z"/><path d="m9 12 2.200 2.200L15 10.500"/></svg><div><strong>Sans paiement en ligne</strong><span>Vous réglez directement avec la boutique</span></div></div>
        <div class="trust-item"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14a2 2 0 0 1 2-2h1v6H6a2 2 0 0 1-2-2v-2ZM20 14a2 2 0 0 0-2-2h-1v6h1a2 2 0 0 0 2-2v-2Z"/></svg><div><strong>À votre écoute</strong><span>@if (wa(); as link) { <a [href]="link" target="_blank" rel="noopener">Un conseil ? Écrivez-nous sur WhatsApp</a> } @else { <a routerLink="/contact">Un conseil ? Écrivez-nous</a> }</span></div></div>
      </div>
    </section>

    <section class="section"><div class="container">
      <div class="section-head">
        <div><span class="eyebrow">Nos univers</span><h2>Élégante, du sac aux talons</h2></div>
      </div>
      <div class="univers" #rail (scroll)="onRailScroll()" (touchstart)="auto = false" (pointerdown)="auto = false">
        @for (u of univers(); track u.key) {
          <a class="utile" [routerLink]="['/catalogue']" [queryParams]="u.params">
            <span class="utile-img">@for (src of u.imgs; track src; let i = $index) { <img [src]="src" alt="" loading="lazy" [class.on]="i === slide() % u.imgs.length" /> }</span>
            <span class="utile-cap">
              <span><strong>{{ u.name }}</strong><span>{{ u.line }}</span></span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
            </span>
          </a>
        }
      </div>
      <div class="rail-dots" aria-hidden="true">@for (u of univers(); track u.key; let i = $index) { <button type="button" tabindex="-1" [class.on]="current() === i" (click)="goTo(i)"></button> }</div>
    </div></section>

    <section class="section" style="padding-top:0"><div class="container">
      <div class="section-head">
        <div><span class="eyebrow">Tout juste arrivées</span><h2>Les nouveautés</h2></div>
        <a routerLink="/catalogue" class="arrow-link">Voir tout le catalogue
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      </div>
      @if (loading()) { <div class="pgrid">@for (i of [1,2,3,4]; track i) { <div class="skeleton" style="height:340px"></div> }</div> }
      @else if (error()) { <div class="notice error">{{ error() }}</div> }
      @else if (!products().length) {
        <div class="empty">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 8 4.500v9L12 21l-8-4.500v-9L12 3Z"/><path d="m4 7.500 8 4.500 8-4.500M12 12v9"/></svg>
          <h3>La collection se prépare</h3><p>Les premières pièces arrivent très bientôt.</p>
        </div>
      }
      @else {
        <div class="pgrid">@for (p of products(); track p.id) { <app-product-card [p]="p" /> }</div>
        <div class="see-all"><a routerLink="/catalogue" class="btn">Voir tous les articles
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a></div>
      }
    </div></section>

    @if (!account.customer()) {
      <section class="join"><div class="container join-in">
        <div>
          <span class="eyebrow">Espace client</span>
          <p>Un compte, et tout devient plus simple : vos commandes réunies au même endroit, vos coordonnées déjà prêtes au moment de commander.</p>
        </div>
        <a class="arrow-link" routerLink="/connexion" [queryParams]="{mode: 'creer'}">Créer mon compte
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      </div></section>
    }

    <section class="promise">
      <div class="container">
        <span class="eyebrow">L'esprit de la maison</span>
        <h2>Bien mise,<br />du lundi au dimanche.</h2>
        <p>Le bureau en semaine, le mariage du samedi, la sortie entre amies, la messe du dimanche : pour chaque moment, la pièce qui vous met en valeur. Vous choisissez tranquillement, on vous livre ou vous passez à la boutique.</p>
        <a routerLink="/catalogue" class="btn">Composer ma tenue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      </div>
      <span class="promise-mono" aria-hidden="true">{{ cfg.shopName().charAt(0) }}</span>
    </section>`,
})
export class Home implements OnInit, OnDestroy {
  /** Compteur du défilement des vignettes (une image toutes les 4 secondes). */
  slide = signal(0);
  /** Sur téléphone, les vignettes « Nos univers » défilent une à une ; le défilement automatique s'arrête dès que le visiteur y touche. */
  rail = viewChild<ElementRef<HTMLElement>>('rail');
  auto = true;
  current = signal(0);
  private timer = setInterval(() => { this.slide.update((n) => n + 1); this.advance(); }, 4000);
  private advance() {
    const el = this.rail()?.nativeElement;
    if (!el || !this.auto || el.scrollWidth <= el.clientWidth + 4) return;   // sur ordinateur, tout tient : rien à faire défiler
    const next = (this.current() + 1) % el.children.length;
    el.scrollTo({ left: (el.children[next] as HTMLElement).offsetLeft - el.offsetLeft, behavior: 'smooth' });
  }
  onRailScroll() {
    const el = this.rail()?.nativeElement; if (!el || !el.children.length) return;
    const step = (el.children[0] as HTMLElement).offsetWidth + 16;
    this.current.set(Math.min(el.children.length - 1, Math.round(el.scrollLeft / step)));
  }
  goTo(i: number) { const el = this.rail()?.nativeElement; if (!el) return; this.auto = false; el.scrollTo({ left: (el.children[i] as HTMLElement).offsetLeft - el.offsetLeft, behavior: 'smooth' }); }
  ngOnDestroy() { clearInterval(this.timer); }
  private api = inject(ApiService);
  cfg = inject(ConfigService);
  account = inject(CustomerAuthService);
  wa = () => this.cfg.whatsappLink(`Bonjour ${this.cfg.shopName()}, j'ai une question.`);
  products = signal<ProductCard[]>([]);
  categories = signal<Category[]>([]);
  /** Chaque univers pointe vers sa catégorie si elle existe, sinon vers le catalogue complet. */
  univers = computed(() => UNIVERS.map((u) => {
    const cat = this.categories().find((c) => c.slug.includes(u.key));
    return { ...u, params: cat ? { category: cat.slug } : {} };
  }));
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
