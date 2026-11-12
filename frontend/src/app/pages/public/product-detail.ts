import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { ToastService } from '../../core/toast.service';
import { ProductDetail, Variant } from '../../core/models';
import { buildOptionGroups, findVariant } from '../../core/utils';
import { ImgPipe, MoneyPipe } from '../../shared/pipes';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [RouterLink, MoneyPipe, ImgPipe],
  template: `
    <div class="container section">
      @if (loading()) { <div class="spinner" role="status" aria-label="Chargement"></div> }
      @else if (notFound()) { <div class="empty"><h3>Produit introuvable</h3><a class="btn" routerLink="/catalogue">Retour au catalogue</a></div> }
      @else if (product(); as p) {
        <nav class="crumbs small"><a routerLink="/catalogue">Catalogue</a> / @if (p.category) { <a [routerLink]="['/catalogue']" [queryParams]="{category: p.category.slug}">{{ p.category.name }}</a> / } {{ p.name }}</nav>
        <div class="pd">
          <div class="gallery">
            <div class="gallery-main">
              @if (p.images.length) { <img [src]="p.images[imgIndex()].url | img" [alt]="p.images[imgIndex()].alt" /> }
              @else { <div class="ph" aria-hidden="true">{{ p.name.charAt(0) }}</div> }
            </div>
            @if (p.images.length > 1) {
              <div class="thumbs">@for (im of p.images; track im.id; let i = $index) {
                <button type="button" class="thumb" [class.on]="i === imgIndex()" (click)="imgIndex.set(i)" [attr.aria-label]="'Image ' + (i + 1)"><img [src]="im.url | img" alt="" /></button>
              }</div>
            }
          </div>
          <div class="pd-info">
            @if (p.category) { <span class="eyebrow">{{ p.category.name }}</span> }
            <h1>{{ p.name }}</h1>
            <p class="price">{{ (selected()?.price ?? minPrice()) | money }}</p>

            @for (g of groups(); track g.name) {
              <fieldset class="opt">
                <legend>{{ g.name }}@if (selection()[g.name]) { <span class="muted"> : {{ selection()[g.name] }}</span> }</legend>
                <div class="opt-values">
                  @for (v of g.values; track v) {
                    <button type="button" class="opt-btn" [class.on]="selection()[g.name] === v" [class.out]="!valueAvailable(g.name, v)"
                      [attr.aria-pressed]="selection()[g.name] === v" [attr.title]="valueAvailable(g.name, v) ? null : 'Épuisé'" (click)="choose(g.name, v)">{{ v }}</button>
                  }
                </div>
              </fieldset>
            }

            @if (selected(); as v) {
              @if (v.stock <= 0) { <p class="notice warn">Cette variante est épuisée.</p> }
              @else {
                <p class="stock" [class.low]="v.stock <= 3">@if (v.stock <= 3) { Plus que {{ v.stock }} en stock } @else { En stock }</p>
 <div class="row gap buybar">
                  <div class="qty" role="group" aria-label="Quantité">
                    <button type="button" (click)="qty.set(Math.max(1, qty() - 1))" aria-label="Diminuer">−</button>
                    <span aria-live="polite">{{ qty() }}</span>
                    <button type="button" (click)="qty.set(Math.min(v.stock, qty() + 1))" [disabled]="qty() >= v.stock" aria-label="Augmenter">+</button>
                  </div>
                  <button type="button" class="btn grow" (click)="add(p, v)">Ajouter au panier</button>
                </div>
              }
            } @else if (groups().length) { <p class="notice warn">Cette combinaison n'est pas proposée. Choisissez une autre option.</p> }

            @if (p.description) { <h2 class="mt">Description</h2><p class="desc">{{ p.description }}</p> }
          </div>
        </div>
      }
    </div>`,
})
export class ProductDetailPage {
  slug = input.required<string>();
  private api = inject(ApiService);
  private cart = inject(CartService);
  private toast = inject(ToastService);
  private router = inject(Router);
  private title = inject(Title);
  Math = Math;

  product = signal<ProductDetail | null>(null);
  loading = signal(true);
  notFound = signal(false);
  imgIndex = signal(0);
  qty = signal(1);
  selection = signal<Record<string, string>>({});

  groups = computed(() => buildOptionGroups(this.product()?.variants ?? []));
  selected = computed<Variant | undefined>(() => { const p = this.product(); return p ? findVariant(p.variants, this.selection()) : undefined; });
  minPrice = computed(() => Math.min(...(this.product()?.variants.map((v) => v.price) ?? [0])));

  constructor() {
    effect(() => { const s = this.slug(); this.load(s); });
  }

  private async load(slug: string) {
    this.loading.set(true); this.notFound.set(false);
    try {
      const p = await this.api.get<ProductDetail>(`/products/${slug}`);
      this.product.set(p); this.title.setTitle(p.name); this.imgIndex.set(0); this.qty.set(1);
      const first = p.variants.find((v) => v.stock > 0) ?? p.variants[0];
      this.selection.set({ ...first.attributes });
    } catch { this.notFound.set(true); }
    this.loading.set(false);
  }

  /** Une valeur est disponible si au moins une variante en stock la contient (compte tenu des autres options choisies). */
  valueAvailable(name: string, value: string): boolean {
    const p = this.product(); if (!p) return false;
    const others = Object.entries(this.selection()).filter(([k]) => k !== name);
    return p.variants.some((v) => v.stock > 0 && v.attributes[name] === value && others.every(([k, val]) => v.attributes[k] === undefined || v.attributes[k] === val));
  }

  choose(name: string, value: string) {
    const p = this.product(); if (!p) return;
    const next = { ...this.selection(), [name]: value };
    // Si la combinaison n'existe pas, bascule vers la variante en stock la plus proche contenant ce choix.
    if (!findVariant(p.variants, next)) {
      const alt = p.variants.find((v) => v.attributes[name] === value && v.stock > 0) ?? p.variants.find((v) => v.attributes[name] === value);
      if (alt) { this.selection.set({ ...alt.attributes }); this.qty.set(1); return; }
    }
    this.selection.set(next); this.qty.set(1);
  }

  add(p: ProductDetail, v: Variant) {
    this.cart.add({ variantId: v.id, slug: p.slug, name: p.name, imageUrl: p.images[0]?.url ?? null, attributes: v.attributes, price: v.price, quantity: this.qty() }, v.stock);
    this.toast.success('Ajouté au panier.');
    this.qty.set(1);
  }
}
