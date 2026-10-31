import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { MyOrdersService } from '../../core/my-orders.service';
import { newIdempotencyKey } from '../../core/utils';
import { AttrsPipe, MoneyPipe } from '../../shared/pipes';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MoneyPipe, AttrsPipe],
  template: `
    <div class="container section">
      <h1>Finaliser ma commande</h1>
      @if (!cart.lines().length) {
        <div class="empty"><h3>Votre panier est vide</h3><a class="btn" routerLink="/catalogue">Voir le catalogue</a></div>
      } @else {
        @if (problems().length) {
          <div class="notice error" role="alert">
            <p>{{ message() }}</p>
            <ul>@for (p of problems(); track $index) { <li>{{ p }}</li> }</ul>
            <a class="btn sm" routerLink="/panier">Vérifier mon panier</a>
          </div>
        } @else if (message()) { <div class="notice error" role="alert">{{ message() }}</div> }
        <div class="cart-grid">
          <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <h2>Vos coordonnées</h2>
            <div class="field" [class.invalid]="bad('customerName')"><label for="n">Nom complet</label>
              <input id="n" class="input" formControlName="customerName" autocomplete="name" /><span class="err">@if (bad('customerName')) { Indiquez votre nom (2 caractères minimum) }</span></div>
            <div class="field" [class.invalid]="bad('customerPhone')"><label for="p">Numéro de téléphone</label>
              <input id="p" class="input" type="tel" formControlName="customerPhone" autocomplete="tel" inputmode="tel" /><span class="err">@if (bad('customerPhone')) { Numéro invalide (chiffres, +, espaces) }</span></div>
            <div class="field" [class.invalid]="bad('deliveryAddress')"><label for="a">Adresse de livraison ou lieu de récupération</label>
              <textarea id="a" class="input" formControlName="deliveryAddress" autocomplete="street-address"></textarea><span class="err">@if (bad('deliveryAddress')) { Indiquez une adresse ou un lieu de récupération }</span></div>
            <div class="field"><label for="c">Ville ou quartier</label><input id="c" class="input" formControlName="city" autocomplete="address-level2" /></div>
            <div class="field"><label for="m">Commentaire (facultatif)</label><textarea id="m" class="input" formControlName="comment" maxlength="1000"></textarea></div>
            <p class="hint">Aucun paiement n'est demandé en ligne. Nous vous contactons pour convenir de la livraison et du règlement.</p>
            <button class="btn block" type="submit" [disabled]="submitting()">@if (submitting()) { Envoi en cours… } @else { Confirmer ma commande }</button>
          </form>
          <aside class="card summary">
            <h2>Votre commande</h2>
            @for (l of cart.lines(); track l.variantId) {
              <div class="sum-line"><div><strong>{{ l.name }}</strong><div class="muted small">{{ l.attributes | attrs }}</div><div class="small">{{ l.quantity }} × {{ l.price | money }}</div></div><span>{{ l.price * l.quantity | money }}</span></div>
            }
            <div class="row between total"><span>Total</span><strong>{{ cart.total() | money }}</strong></div>
            <a routerLink="/panier" class="small">Modifier le panier</a>
          </aside>
        </div>
      }
    </div>`,
})
export class Checkout {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);
  private mine = inject(MyOrdersService);
  cart = inject(CartService);
  submitting = signal(false);
  message = signal('');
  problems = signal<string[]>([]);
  private key = newIdempotencyKey();

  form = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    customerPhone: ['', [Validators.required, Validators.pattern(/^[+0-9 ().-]{6,25}$/)]],
    deliveryAddress: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(500)]],
    city: [''],
    comment: [''],
  });
  bad = (c: string) => { const x = this.form.get(c)!; return x.invalid && (x.dirty || x.touched); };

  async submit() {
    if (this.submitting()) return; // protection double clic
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true); this.message.set(''); this.problems.set([]);
    const v = this.form.getRawValue();
    try {
      const res = await this.api.post<{ orderNumber: string; createdAt: string }>('/orders', {
        ...v,
        items: this.cart.lines().map((l) => ({ variantId: l.variantId, quantity: l.quantity, expectedPrice: l.price })),
      }, { 'Idempotency-Key': this.key });
      this.mine.add({ orderNumber: res.orderNumber, phone: v.customerPhone, createdAt: res.createdAt });
      this.cart.clear();
      await this.router.navigate(['/confirmation', res.orderNumber]);
    } catch (e) {
      const err = toApiError(e);
      this.message.set(err.message);
      if (err.code === 'CART_CHANGED' && Array.isArray(err.details)) {
        this.problems.set(err.details.map((d: any) => d.message ?? 'Article indisponible.'));
        this.key = newIdempotencyKey(); // le panier va changer : nouvelle tentative = nouvelle clé
      } else if (err.status === 400 && Array.isArray(err.details)) {
        this.problems.set(err.details.map((d: any) => d.message));
      }
      this.submitting.set(false);
    }
  }
}
