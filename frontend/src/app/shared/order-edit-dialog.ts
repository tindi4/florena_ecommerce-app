import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService, toApiError } from '../core/api.service';
import { AdminOrder, SellableVariant } from '../core/models';
import { ToastService } from '../core/toast.service';
import { LocationPicker, PickedLocation } from './location-picker';
import { AttrsPipe, MoneyPipe } from './pipes';

interface Line { lineId?: number; variantId?: number | null; name: string; attributes: Record<string, string>; quantity: number; unitPrice: number; stock?: number; }

/**
 * Modification complète d'une commande par la boutique : coordonnées, numéro de téléphone, livraison, articles.
 * Réservée aux rôles qui ont la permission « orders_edit » (le serveur la revérifie).
 */
@Component({
  selector: 'app-order-edit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, LocationPicker, MoneyPipe, AttrsPipe],
  template: `
    <div class="modal-backdrop" (click)="closed.emit()">
      <form class="modal wide" role="dialog" aria-modal="true" aria-label="Modifier la commande" [formGroup]="form" (ngSubmit)="save()" (click)="$event.stopPropagation()" novalidate>
        <div class="row between"><h2>Modifier la commande {{ order().orderNumber }}</h2><button type="button" class="btn ghost sm" (click)="closed.emit()" aria-label="Fermer">✕</button></div>
        @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }

        <h3>Client et livraison</h3>
        <div class="grid cols-2">
          <div class="field"><label for="ed-n">Nom</label><input id="ed-n" class="input" formControlName="customerName" /></div>
          <div class="field" [class.invalid]="form.controls.customerPhone.invalid && form.controls.customerPhone.touched"><label for="ed-p">Numéro de téléphone</label>
            <input id="ed-p" class="input" type="tel" formControlName="customerPhone" inputmode="tel" />
            <span class="hint">Le client devra utiliser ce numéro pour suivre sa commande.</span></div>
        </div>
        <div class="opt-check" style="margin-bottom:.8rem">
          <label class="check"><input type="checkbox" [checked]="gender() === 'HOMME'" (change)="toggleGender('HOMME')" /> Monsieur</label>
          <label class="check"><input type="checkbox" [checked]="gender() === 'FEMME'" (change)="toggleGender('FEMME')" /> Madame</label>
          <label class="check"><input type="checkbox" [checked]="deliver()" (change)="toggleDeliver()" /> Livraison demandée</label>
          @if (deliver()) { <label class="check"><input type="checkbox" [checked]="feeAccepted()" (change)="feeAccepted.set(!feeAccepted())" /> Frais de livraison acceptés</label> }
        </div>
        <div class="field"><label for="ed-a">Adresse ou quartier</label><textarea id="ed-a" class="input" formControlName="deliveryAddress"></textarea></div>
        <div class="field"><label>Position sur la carte @if (order().locationLabel) { <span class="muted">(actuelle : {{ order().locationLabel }})</span> }</label><app-location-picker (changed)="onLocation($event)" /></div>
        <div class="field"><label for="ed-m">Message du client</label><textarea id="ed-m" class="input" formControlName="comment" maxlength="1000"></textarea></div>

        <h3>Articles</h3>
        @if (!itemsEditable()) { <div class="notice warn">Les articles ne sont plus modifiables : la commande est {{ order().status === 'ANNULEE' ? 'annulée' : 'terminée' }}.</div> }
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Article</th><th class="num">Prix unitaire</th><th class="num">Quantité</th><th class="num">Total</th><th></th></tr></thead>
          <tbody>
            @for (l of lines(); track $index; let i = $index) {
              <tr>
                <td><strong>{{ l.name }}</strong><div class="muted small">{{ l.attributes | attrs }}@if (l.stock !== undefined) { · stock {{ l.stock }} }</div></td>
                <td class="num"><input class="input" style="width:110px;text-align:right" type="number" min="0" step="any" [value]="l.unitPrice" [disabled]="!itemsEditable()" (input)="setLine(i, 'unitPrice', +$any($event.target).value)" [attr.aria-label]="'Prix de ' + l.name" /></td>
                <td class="num"><input class="input" style="width:80px;text-align:right" type="number" min="1" max="999" step="1" [value]="l.quantity" [disabled]="!itemsEditable()" (input)="setLine(i, 'quantity', +$any($event.target).value)" [attr.aria-label]="'Quantité de ' + l.name" /></td>
                <td class="num">{{ l.unitPrice * l.quantity | money:order().currency }}</td>
                <td class="num"><button type="button" class="btn sm danger-ghost" [disabled]="!itemsEditable() || lines().length === 1" (click)="removeLine(i)" [attr.aria-label]="'Retirer ' + l.name">✕</button></td>
              </tr>
            }
          </tbody>
          <tfoot>
            <tr><td colspan="3" class="num">Articles</td><td class="num">{{ subtotal() | money:order().currency }}</td><td></td></tr>
            <tr><td colspan="3" class="num">Livraison</td><td class="num">{{ order().deliveryFeeStatus === 'SET' && deliver() ? (order().deliveryFee | money:order().currency) : '—' }}</td><td></td></tr>
            <tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>{{ total() | money:order().currency }}</strong></td><td></td></tr>
          </tfoot>
        </table></div>

        @if (itemsEditable()) {
          <div class="field" style="margin-top:.8rem"><label for="ed-s">Ajouter un article</label>
            <input id="ed-s" class="input" type="search" placeholder="Nom du produit ou SKU" #q (input)="search(q.value)" autocomplete="off" /></div>
          @if (results().length) {
            <ul class="picklist">
              @for (r of results(); track r.variantId) {
                <li><button type="button" (click)="addVariant(r); q.value = ''"><span><strong>{{ r.productName }}</strong> <span class="muted small">{{ r.attributes | attrs }}</span></span><span class="small">{{ r.price | money:order().currency }} · stock {{ r.stock }}</span></button></li>
              }
            </ul>
          }
          <p class="hint">Le stock est ajusté automatiquement (retiré ou remis en vente). Le prix d'un article ajouté est le prix actuel du catalogue ; vous pouvez le modifier.</p>
        }

        <div class="row end gap wrap" style="margin-top:1rem">
          <button type="button" class="btn ghost" (click)="closed.emit()">Annuler</button>
          <button type="submit" class="btn" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Enregistrer les modifications' }}</button>
        </div>
      </form>
    </div>`,
})
export class OrderEditDialog {
  order = input.required<AdminOrder>();
  saved = output<AdminOrder>();
  closed = output<void>();
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);

  error = signal(''); saving = signal(false);
  gender = signal<'HOMME' | 'FEMME' | null>(null); deliver = signal(false); feeAccepted = signal(false);
  lines = signal<Line[]>([]); results = signal<SellableVariant[]>([]);
  private locChanged = false; private newLoc: PickedLocation | null = null; private searchTimer: any;
  itemsEditable = computed(() => ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION'].includes(this.order().status));
  subtotal = computed(() => this.lines().reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  total = computed(() => this.subtotal() + (this.order().deliveryFeeStatus === 'SET' && this.deliver() ? this.order().deliveryFee : 0));

  form = this.fb.nonNullable.group({
    customerName: ['', [Validators.required, Validators.minLength(2)]],
    customerPhone: ['', [Validators.required, Validators.pattern(/^[+0-9 ().-]{6,25}$/)]],
    deliveryAddress: [''], comment: [''],
  });

  ngOnInit() {
    const o = this.order();
    this.form.reset({ customerName: o.customerName ?? '', customerPhone: o.customerPhone, deliveryAddress: o.deliveryAddress === 'Retrait sur place' ? '' : o.deliveryAddress, comment: o.comment ?? '' });
    this.gender.set(o.customerGender); this.deliver.set(o.deliveryRequested); this.feeAccepted.set(o.deliveryFeeAccepted);
    this.lines.set(o.items.map((i) => ({ lineId: i.id, variantId: i.variantId, name: i.name, attributes: i.attributes, quantity: i.quantity, unitPrice: i.unitPrice })));
  }

  toggleGender(g: 'HOMME' | 'FEMME') { this.gender.update((c) => (c === g ? null : g)); }
  toggleDeliver() { this.deliver.update((v) => !v); if (!this.deliver()) this.feeAccepted.set(false); }
  onLocation(l: PickedLocation | null) { this.locChanged = true; this.newLoc = l; }
  setLine(i: number, key: 'quantity' | 'unitPrice', value: number) { this.lines.update((ls) => ls.map((l, idx) => (idx === i ? { ...l, [key]: Number.isFinite(value) ? value : 0 } : l))); }
  removeLine(i: number) { this.lines.update((ls) => ls.filter((_, idx) => idx !== i)); }

  search(text: string) {
    clearTimeout(this.searchTimer);
    if (text.trim().length < 2) { this.results.set([]); return; }
    this.searchTimer = setTimeout(async () => {
      try { this.results.set((await this.api.get<{ items: SellableVariant[] }>('/admin/order-variants', { search: text.trim() })).items); } catch { this.results.set([]); }
    }, 250);
  }
  addVariant(v: SellableVariant) {
    if (this.lines().some((l) => l.variantId === v.variantId)) { this.toast.error('Cet article est déjà dans la commande : modifiez sa quantité.'); return; }
    this.lines.update((ls) => [...ls, { variantId: v.variantId, name: v.productName, attributes: v.attributes, quantity: 1, unitPrice: v.price, stock: v.stock }]);
    this.results.set([]);
  }

  async save() {
    this.form.markAllAsTouched(); this.error.set('');
    if (this.form.invalid) { this.error.set('Vérifiez le nom et le numéro de téléphone.'); return; }
    const ls = this.lines();
    if (this.itemsEditable() && ls.some((l) => !(l.quantity >= 1) || !(l.unitPrice >= 0))) { this.error.set('Quantités et prix : valeurs positives uniquement.'); return; }
    const v = this.form.getRawValue();
    const details: Record<string, unknown> = {
      customerName: v.customerName.trim(), customerPhone: v.customerPhone.trim(), customerGender: this.gender() ?? '',
      deliveryAddress: v.deliveryAddress.trim(), comment: v.comment.trim(), deliveryRequested: this.deliver(), deliveryFeeAccepted: this.deliver() && this.feeAccepted(),
    };
    if (this.locChanged) { details['latitude'] = this.newLoc?.latitude ?? null; details['longitude'] = this.newLoc?.longitude ?? null; details['locationLabel'] = this.newLoc?.label ?? null; }
    const body: Record<string, unknown> = { details };
    if (this.itemsEditable()) body['items'] = ls.map((l) => (l.lineId ? { lineId: l.lineId, quantity: l.quantity, unitPrice: l.unitPrice } : { variantId: l.variantId, quantity: l.quantity, unitPrice: l.unitPrice }));
    this.saving.set(true);
    try {
      const updated = await this.api.put<AdminOrder>(`/admin/orders/${this.order().id}`, body);
      this.toast.success('Commande modifiée.');
      this.saved.emit(updated);
    } catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ? `${err.message} ${err.details[0].message}` : err.message); }
    this.saving.set(false);
  }
}
