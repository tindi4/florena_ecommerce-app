import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ProductCard } from '../core/models';
import { ImgPipe, MoneyPipe } from './pipes';

@Component({
  selector: 'app-product-card',
  standalone: true,
  imports: [RouterLink, MoneyPipe, ImgPipe],
  template: `
    <article class="pcard" [class.soldout]="!p().inStock">
      <a class="pcard-img" [routerLink]="['/produit', p().slug]" [attr.aria-label]="p().name">
        @if (p().imageUrl) { <img [src]="p().imageUrl | img" [alt]="p().name" loading="lazy" /> }
        @else { <div class="ph" aria-hidden="true">{{ p().name.charAt(0) }}</div> }
        @if (!p().inStock) { <span class="pcard-flag">Épuisé</span> }
      </a>
      <div class="pcard-body">
        @if (p().category) { <span class="pcard-cat">{{ p().category!.name }}</span> }
        <h3><a [routerLink]="['/produit', p().slug]">{{ p().name }}</a></h3>
        <p class="muted small clamp">{{ p().shortDescription }}</p>
        <div class="pcard-foot">
          <strong>@if (p().priceMin !== p().priceMax) { <span class="from">dès </span> }{{ p().priceMin | money }}</strong>
          <a class="btn sm ghost" [routerLink]="['/produit', p().slug]">Voir le produit</a>
        </div>
      </div>
    </article>`,
})
export class ProductCardComponent { p = input.required<ProductCard>(); }
