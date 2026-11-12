import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { CartService } from '../../core/cart.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { MyOrdersService } from '../../core/my-orders.service';
import { newIdempotencyKey } from '../../core/utils';
import { LocationPicker, PickedLocation } from '../../shared/location-picker';
import { AttrsPipe, MoneyPipe } from '../../shared/pipes';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, MoneyPipe, AttrsPipe, LocationPicker],
  template: `
    <div class="container section">
      <header class="page-head"><span class="eyebrow">Dernière étape</span><h1>Finaliser ma commande</h1></header>
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
            @if (!account.customer()) {
              <p class="join-note" style="margin:-.4rem 0 1.4rem">Déjà client ? <a routerLink="/connexion" [queryParams]="{retour: '/commande'}">Connectez-vous</a> pour retrouver vos coordonnées. Sinon, vous pourrez créer votre compte juste après la commande.</p>
            }

            <fieldset class="field" style="border:0;padding:0">
              <legend style="margin-bottom:.35rem">Civilité <span class="muted">(facultatif)</span></legend>
              <div class="opt-check">
                <label class="check"><input type="checkbox" [checked]="gender() === 'HOMME'" (change)="toggleGender('HOMME')" /> Monsieur</label>
                <label class="check"><input type="checkbox" [checked]="gender() === 'FEMME'" (change)="toggleGender('FEMME')" /> Madame</label>
              </div>
            </fieldset>

            <div class="field" [class.invalid]="bad('customerName')"><label for="n">Nom</label>
              <input id="n" class="input" formControlName="customerName" autocomplete="name" />
              <span class="err">@if (bad('customerName')) { Indiquez votre nom (2 caractères minimum) }</span></div>
            <div class="field" [class.invalid]="bad('customerPhone')"><label for="p">Numéro de téléphone</label>
              <input id="p" class="input" type="tel" formControlName="customerPhone" autocomplete="tel" inputmode="tel" />
              <span class="err">@if (bad('customerPhone')) { Numéro invalide (chiffres, +, espaces) }</span></div>

            <div class="delivery-box">
              <label class="check"><input type="checkbox" [checked]="deliver()" (change)="toggleDeliver()" /> Me faire livrer</label>
              @if (deliver()) {
                <label class="check sub"><input type="checkbox" [checked]="feeAccepted()" (change)="feeAccepted.set(!feeAccepted())" /> Ajouter les frais de livraison</label>
                <p class="hint">Les frais de livraison sont ajoutés par la boutique après confirmation de votre commande : vous les verrez dans le suivi.</p>
              }
            </div>

            <div class="field" [class.invalid]="bad('deliveryAddress')">
              <label for="a">Adresse ou quartier @if (!deliver()) { <span class="muted">(facultatif)</span> }</label>
              <textarea id="a" class="input" formControlName="deliveryAddress" autocomplete="street-address"></textarea>
              <span class="err">@if (bad('deliveryAddress')) { Indiquez votre adresse ou quartier pour la livraison }</span></div>
            <div class="field"><label>Ma localisation <span class="muted">(facultatif)</span></label>
              <app-location-picker (changed)="onLocation($event)" /></div>

            <div class="field"><label for="m">Laissez un message <span class="muted">(facultatif)</span></label>
              <textarea id="m" class="input" formControlName="comment" maxlength="1000"></textarea></div>
            <p class="hint">Aucun paiement n'est demandé en ligne. Nous vous contactons pour confirmer et convenir du règlement.</p>
            <button class="btn block" type="submit" [disabled]="submitting()">@if (submitting()) { Envoi en cours… } @else { Confirmer ma commande }</button>
          </form>
          <aside class="card summary">
            <h2>Votre commande</h2>
            @for (l of cart.lines(); track l.variantId) {
              <div class="sum-line"><div><strong>{{ l.name }}</strong><div class="muted small">{{ l.attributes | attrs }}</div><div class="small">{{ l.quantity }} × {{ l.price | money }}</div></div><span>{{ l.price * l.quantity | money }}</span></div>
            }
            @if (deliver()) { <div class="row between small muted" style="margin-top:.5rem"><span>Livraison</span><span>{{ feeAccepted() ? 'frais ajoutés après confirmation' : 'à convenir' }}</span></div> }
            <div class="row between total"><span>Total articles</span><strong>{{ cart.total() | money }}</strong></div>
            <a routerLink="/panier" class="small">Modifier le panier</a>
          </aside>
        </div>
      }
    </div>`,
})
export class Checkout implements OnInit {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private router = inject(Router);
  private mine = inject(MyOrdersService);
  cart = inject(CartService);
  account = inject(CustomerAuthService);
  submitting = signal(false);
  message = signal('');
  problems = signal<string[]>([]);
  private key = newIdempotencyKey();

  gender = signal<'HOMME' | 'FEMME' | null>(null);   // Monsieur / Madame : décochées par défaut
  deliver = signal(false);                            // « Me faire livrer »
  feeAccepted = signal(false);                        // « Ajouter les frais de livraison »
  location = signal<PickedLocation | null>(null);

  form = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    customerPhone: ['', [Validators.required, Validators.pattern(/^[+0-9 ().-]{6,25}$/)]],
    deliveryAddress: [''],
    comment: [''],
  });

  /** Client connecté : nom et téléphone préremplis, la commande sera rattachée à son compte. */
  async ngOnInit() {
    if (!(await this.account.restore())) return;
    const c = this.account.customer()!;
    const f = this.form.controls;
    if (!f.customerPhone.value) f.customerPhone.setValue(c.phone);
    if (!f.customerName.value && c.name) f.customerName.setValue(c.name);
  }

  bad = (c: string) => { const x = this.form.get(c)!; return x.invalid && (x.dirty || x.touched); };
  toggleGender(g: 'HOMME' | 'FEMME') { this.gender.update((cur) => (cur === g ? null : g)); }
  toggleDeliver() {
    this.deliver.update((v) => !v);
    const addr = this.form.controls.deliveryAddress;
    addr.setValidators(this.deliver() ? [Validators.required, Validators.minLength(5)] : []);
    addr.updateValueAndValidity();
    if (!this.deliver()) this.feeAccepted.set(false);
  }
  onLocation(l: PickedLocation | null) {
    this.location.set(l);
    const addr = this.form.controls.deliveryAddress;
    if (l && !addr.value.trim()) addr.setValue(l.label);
  }

  async submit() {
    if (this.submitting()) return; // protection double clic
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.submitting.set(true); this.message.set(''); this.problems.set([]);
    const v = this.form.getRawValue();
    try {
      const loc = this.location();
      const res = await this.api.post<{ orderNumber: string; trackingCode: string; createdAt: string }>('/orders', {
        customerName: v.customerName.trim(), customerGender: this.gender() ?? undefined, customerPhone: v.customerPhone,
        deliveryAddress: v.deliveryAddress.trim() || undefined, comment: v.comment.trim() || undefined,
        deliveryRequested: this.deliver(), deliveryFeeAccepted: this.deliver() && this.feeAccepted(),
        latitude: loc?.latitude, longitude: loc?.longitude, locationLabel: loc?.label,
        items: this.cart.lines().map((l) => ({ variantId: l.variantId, quantity: l.quantity, expectedPrice: l.price })),
      }, { 'Idempotency-Key': this.key });
      this.mine.add({ orderNumber: res.orderNumber, phone: v.customerPhone, createdAt: res.createdAt, trackingCode: res.trackingCode });
      this.cart.clear();
      await this.router.navigate(['/confirmation', res.orderNumber]);
    } catch (e) {
      const err = toApiError(e);
      this.message.set(err.message);
      if (err.code === 'CART_CHANGED' && Array.isArray(err.details)) {
        this.problems.set(err.details.map((d: any) => d.message ?? 'Article indisponible.'));
        this.key = newIdempotencyKey();
      } else if (err.status === 400 && Array.isArray(err.details)) {
        this.problems.set(err.details.map((d: any) => d.message));
      }
      this.submitting.set(false);
    }
  }
}
