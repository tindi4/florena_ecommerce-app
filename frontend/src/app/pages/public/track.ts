import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { MyOrdersService, SavedOrder } from '../../core/my-orders.service';
import { OrderStatus, TrackedOrder } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { saveBlob } from '../../core/utils';
import { LocationPicker, PickedLocation } from '../../shared/location-picker';
import { AttrsPipe, MoneyPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';

type Access = { code: string } | { orderNumber: string; phone: string };
const FULL_CODE = /^CMD-[A-Z2-9]{10}-[A-Z2-9]{20}$/;
const savedAccess = (s: SavedOrder): Access => (s.trackingCode ? { code: s.trackingCode } : { orderNumber: s.orderNumber, phone: s.phone });

const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: 'EN_ATTENTE', label: 'Commande reçue', hint: 'Nous avons bien reçu votre commande.' },
  { status: 'CONFIRMEE', label: 'Confirmée', hint: 'Votre commande est validée par la boutique.' },
  { status: 'EN_PREPARATION', label: 'En préparation', hint: 'Nous préparons vos articles.' },
  { status: 'TERMINEE', label: 'Terminée', hint: 'Votre commande est terminée.' },
];

@Component({
  selector: 'app-track',
  standalone: true,
  imports: [ReactiveFormsModule, StatusBadge, PayBadge, MoneyPipe, AttrsPipe, DatePipe, LocationPicker],
  template: `
    <div class="container section narrow">
      <h1>Suivre ma commande</h1>
      <form class="card" [formGroup]="form" (ngSubmit)="search()" novalidate>
        <div class="grid cols-2">
          <div class="field"><label for="no">Code complet ou numéro de commande</label><input id="no" class="input" formControlName="orderNumber" placeholder="CMD-XXXXXXXXXX" autocapitalize="characters" autocomplete="off" /></div>
          <div class="field"><label for="ph">Téléphone utilisé pour la commande</label><input id="ph" class="input" type="tel" formControlName="phone" inputmode="tel" />
            <span class="hint">Inutile si vous avez collé le code complet (CMD-XXXXXXXXXX-…).</span></div>
        </div>
        <button class="btn" type="submit" [disabled]="loading()">Voir ma commande</button>
      </form>
      @if (error()) { <div class="notice error mt" role="alert">{{ error() }}</div> }

      @if (order(); as o) {
        <section class="card mt" aria-live="polite">
          <div class="row between wrap gap"><h2>{{ o.orderNumber }}</h2><div class="row gap"><app-status-badge [status]="o.status" /><app-pay-badge [paid]="o.paymentStatus" /></div></div>
          <p class="muted small">Passée le {{ o.createdAt | date:'dd/MM/yyyy à HH:mm' }} · mise à jour automatique</p>
          <p class="small">Code de suivi complet : <code class="code-inline">{{ o.trackingCode }}</code> <span class="muted">(il suffit seul pour retrouver cette commande : ne le partagez pas)</span></p>

          @if (o.status === 'ANNULEE') { <div class="notice warn">Cette commande a été annulée. Contactez-nous si vous avez des questions.</div> }
          @else {
            <ol class="steps">
              @for (s of steps; track s.status; let i = $index) {
                <li [class.done]="rank(o.status) >= i" [class.now]="rank(o.status) === i">
                  <span class="bullet" aria-hidden="true">{{ rank(o.status) >= i ? '✓' : '' }}</span>
                  <div><strong>{{ s.label }}</strong>@if (rank(o.status) === i) { <div class="muted small">{{ s.hint }}</div> }</div>
                </li>
              }
            </ol>
          }
          @if (o.paymentStatus === 'PAYE') { <div class="notice ok">Paiement reçu{{ o.paidAt ? ' le ' + (o.paidAt | date:'dd/MM/yyyy') : '' }}. Merci !</div> }

          <h3 class="mt">Articles</h3>
          @for (i of o.items; track i.id) {
            <div class="sum-line"><div><strong>{{ i.name }}</strong><div class="muted small">{{ i.attributes | attrs }}</div><div class="small">{{ i.quantity }} × {{ i.unitPrice | money:o.currency }}</div></div><span>{{ i.lineTotal | money:o.currency }}</span></div>
          }
          <div class="row between small" style="margin-top:.6rem"><span>Articles</span><span>{{ o.subtotal | money:o.currency }}</span></div>
          @if (o.deliveryRequested) {
            <div class="row between small"><span>Livraison</span>
              <span>@if (o.deliveryFeeStatus === 'SET') { {{ o.deliveryFee | money:o.currency }} } @else if (o.deliveryFeeStatus === 'PENDING') { frais ajoutés après confirmation } @else { à convenir }</span></div>
          } @else { <div class="row between small muted"><span>Retrait sur place</span><span></span></div> }
          <div class="row between total"><span>Total</span><strong>{{ o.total | money:o.currency }}</strong></div>
          <p class="muted small">{{ o.deliveryRequested ? 'Livraison' : 'Adresse' }} : {{ o.deliveryAddress }}</p>

          <div class="row gap wrap mt-s">
            <button type="button" class="btn ghost" (click)="invoice(o)" [disabled]="pdfBusy()">📄 Télécharger ma facture (PDF)</button>
            @if (wa(o); as link) { <a class="btn wa" [href]="link" target="_blank" rel="noopener">💬 Continuer sur WhatsApp</a> }
            @if (o.canEdit && !editing()) { <button type="button" class="btn ghost" (click)="startEdit(o)">✏️ Modifier ma commande</button> }
          </div>
          @if (!o.canEdit && o.status !== 'ANNULEE' && o.status !== 'TERMINEE') { <p class="hint">Votre commande est en préparation : pour la modifier, écrivez-nous sur WhatsApp ou via « Contact ».</p> }

          @if (editing()) {
            <form class="edit-box" [formGroup]="editForm" (ngSubmit)="saveEdit(o)" novalidate>
              <h3>Modifier ma commande</h3>
              <p class="hint">La boutique est prévenue immédiatement de toute modification.</p>
              <fieldset class="field" style="border:0;padding:0"><legend style="font-weight:700;font-size:.9rem">Civilité <span class="muted">(facultatif)</span></legend>
                <div class="opt-check">
                  <label class="check"><input type="checkbox" [checked]="gender() === 'HOMME'" (change)="toggleGender('HOMME')" /> Monsieur</label>
                  <label class="check"><input type="checkbox" [checked]="gender() === 'FEMME'" (change)="toggleGender('FEMME')" /> Madame</label>
                </div></fieldset>
              <div class="field"><label for="en">Nom</label><input id="en" class="input" formControlName="customerName" /></div>
              <div class="delivery-box">
                <label class="check"><input type="checkbox" [checked]="deliver()" (change)="deliver.set(!deliver())" /> Me faire livrer</label>
                @if (deliver()) { <label class="check sub"><input type="checkbox" [checked]="feeAccepted()" (change)="feeAccepted.set(!feeAccepted())" /> Ajouter les frais de livraison</label> }
              </div>
              <div class="field"><label for="ea">Adresse ou quartier</label><textarea id="ea" class="input" formControlName="deliveryAddress"></textarea></div>
              <div class="field"><label>Ma localisation</label><app-location-picker (changed)="onLocation($event)" /></div>
              <div class="field"><label for="em">Laissez un message <span class="muted">(facultatif)</span></label><textarea id="em" class="input" formControlName="comment" maxlength="1000"></textarea></div>
              @if (editError()) { <div class="notice error" role="alert">{{ editError() }}</div> }
              <div class="row gap wrap"><button class="btn" type="submit" [disabled]="saving()">Enregistrer les modifications</button><button type="button" class="btn ghost" (click)="editing.set(false)">Annuler</button></div>
            </form>
          }
        </section>
      }

      @if (mine.orders().length) {
        <h2 class="mt">Mes commandes sur cet appareil</h2>
        <div class="stack">
          @for (s of mine.orders(); track s.orderNumber) {
            <button type="button" class="card flat saved" (click)="openSaved(s)">
              <strong>{{ s.orderNumber }}</strong>
              @if (statuses()[s.orderNumber]; as st) { <app-status-badge [status]="st" /> } @else { <span class="muted small">Afficher</span> }
            </button>
          }
        </div>
      }
    </div>`,
})
export class Track implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);
  private cfg = inject(ConfigService);
  private toast = inject(ToastService);
  mine = inject(MyOrdersService);
  steps = STEPS;
  order = signal<TrackedOrder | null>(null);
  error = signal(''); loading = signal(false); pdfBusy = signal(false);
  statuses = signal<Record<string, OrderStatus>>({});
  private timer: any;
  form = this.fb.nonNullable.group({ orderNumber: ['', Validators.required], phone: [''] });
  /** Moyen d'accès en cours : code complet seul, ou numéro + téléphone (jamais le téléphone seul). */
  private access: Access | null = null;
  rank = (s: OrderStatus) => STEPS.findIndex((x) => x.status === s);

  // Modification par le client
  editing = signal(false); saving = signal(false); editError = signal('');
  gender = signal<'HOMME' | 'FEMME' | null>(null); deliver = signal(false); feeAccepted = signal(false);
  private locChanged = false; private newLoc: PickedLocation | null = null;
  editForm = this.fb.nonNullable.group({ customerName: ['', [Validators.required, Validators.minLength(2)]], deliveryAddress: [''], comment: [''] });

  ngOnInit() {
    // Lien /suivi#CMD-…-… : le code est après « # », il n'est jamais envoyé au serveur dans l'adresse.
    const fragment = (this.route.snapshot.fragment || '').trim().toUpperCase();
    const n = this.route.snapshot.queryParamMap.get('n');
    const saved = this.mine.orders();
    if (FULL_CODE.test(fragment)) {
      this.form.patchValue({ orderNumber: fragment, phone: '' });
      this.fetch({ code: fragment });
    } else if (n) {
      const s = saved.find((o) => o.orderNumber === n);
      this.form.patchValue({ orderNumber: n, phone: s?.phone ?? '' });
      if (s) this.openSaved(s);
    }
    saved.forEach(async (s) => {
      try { const o = await this.api.post<TrackedOrder>('/orders/track', savedAccess(s)); this.statuses.update((m) => ({ ...m, [s.orderNumber]: o.status })); if (!s.trackingCode) this.mine.remember(s.orderNumber, o.trackingCode); } catch { /* ignore */ }
    });
    this.timer = setInterval(() => { if (this.access && this.order() && !this.editing()) this.fetch(this.access, true); }, 30000);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  search() {
    const v = this.form.getRawValue();
    const ref = v.orderNumber.trim().toUpperCase();
    if (FULL_CODE.test(ref)) { this.fetch({ code: ref }); return; }
    if (!ref || !v.phone.trim()) { this.order.set(null); this.error.set('Saisissez le code complet de la commande, ou le numéro de commande avec le téléphone utilisé.'); return; }
    this.fetch({ orderNumber: ref, phone: v.phone });
  }
  openSaved(s: SavedOrder) {
    this.editing.set(false);
    this.form.patchValue({ orderNumber: s.trackingCode ?? s.orderNumber, phone: s.trackingCode ? '' : s.phone });
    this.fetch(savedAccess(s));
  }
  wa = (o: TrackedOrder) => this.cfg.whatsappLink(`Bonjour, je vous écris au sujet de ma commande ${o.orderNumber}.`);

  async invoice(o: TrackedOrder) {
    this.pdfBusy.set(true);
    try { saveBlob(await this.api.postBlob('/orders/invoice', { code: o.trackingCode }), `${o.orderNumber}.pdf`); }
    catch { this.toast.error('Impossible de générer la facture pour le moment.'); }
    this.pdfBusy.set(false);
  }

  startEdit(o: TrackedOrder) {
    this.editForm.reset({ customerName: o.customerName, deliveryAddress: o.deliveryAddress === 'Retrait sur place' ? '' : o.deliveryAddress, comment: o.comment ?? '' });
    this.gender.set(o.customerGender); this.deliver.set(o.deliveryRequested); this.feeAccepted.set(o.deliveryFeeAccepted);
    this.locChanged = false; this.newLoc = null; this.editError.set(''); this.editing.set(true);
  }
  toggleGender(g: 'HOMME' | 'FEMME') { this.gender.update((c) => (c === g ? null : g)); }
  onLocation(l: PickedLocation | null) { this.locChanged = true; this.newLoc = l; }

  async saveEdit(o: TrackedOrder) {
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) { this.editError.set('Indiquez votre nom (2 caractères minimum).'); return; }
    const v = this.editForm.getRawValue();
    const changes: Record<string, unknown> = {
      customerName: v.customerName.trim(), customerGender: this.gender() ?? '', deliveryAddress: v.deliveryAddress.trim(),
      comment: v.comment.trim(), deliveryRequested: this.deliver(), deliveryFeeAccepted: this.deliver() && this.feeAccepted(),
    };
    if (this.locChanged) { changes['latitude'] = this.newLoc?.latitude ?? null; changes['longitude'] = this.newLoc?.longitude ?? null; changes['locationLabel'] = this.newLoc?.label ?? null; }
    this.saving.set(true); this.editError.set('');
    try {
      this.order.set(await this.api.patch<TrackedOrder>('/orders/edit', { code: o.trackingCode, changes }));
      this.editing.set(false); this.toast.success('Modifications enregistrées : la boutique a été prévenue.');
    } catch (e) { const err = toApiError(e); this.editError.set(err.details?.[0]?.message ?? err.message); }
    this.saving.set(false);
  }

  private async fetch(access: Access, silent = false) {
    if (!silent) { this.loading.set(true); this.error.set(''); }
    try {
      const o = await this.api.post<TrackedOrder>('/orders/track', access);
      // Une fois la commande trouvée, on continue avec le code complet (rafraîchissement, facture, modification).
      this.access = { code: o.trackingCode };
      this.order.set(o); this.statuses.update((m) => ({ ...m, [o.orderNumber]: o.status }));
    } catch (e) { if (!silent) { this.order.set(null); const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); } }
    this.loading.set(false);
  }
}
