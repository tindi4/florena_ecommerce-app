import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { ApiService, toApiError } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { MyOrdersService, SavedOrder } from '../../core/my-orders.service';
import { OrderStatus, TrackedOrder } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { saveBlob } from '../../core/utils';
import { LocationPicker, PickedLocation } from '../../shared/location-picker';
import { AttrsPipe, MoneyPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';

/** Résumé renvoyé par la recherche « téléphone + nom » : rien de sensible, numéro masqué. */
interface FoundOrder { ref: string; status: OrderStatus; paymentStatus: 'PAYE' | 'NON_PAYE'; total: number; currency: string; itemCount: number; createdAt: string; }
type Access = { code: string } | { orderNumber: string; phone?: string };
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
  imports: [ReactiveFormsModule, RouterLink, StatusBadge, PayBadge, MoneyPipe, AttrsPipe, DatePipe, LocationPicker],
  template: `
    <div class="container section narrow">
      <header class="page-head"><span class="eyebrow">Suivi en direct</span><h1>Où en est ma commande ?</h1></header>
      <div class="tabs" role="tablist">
        <button role="tab" type="button" class="tab" [class.on]="mode() === 'simple'" [attr.aria-selected]="mode() === 'simple'" (click)="mode.set('simple')">Avec mon téléphone</button>
        <button role="tab" type="button" class="tab" [class.on]="mode() === 'code'" [attr.aria-selected]="mode() === 'code'" (click)="mode.set('code')">Avec mon code</button>
      </div>

      @if (mode() === 'simple') {
        <form class="card" [formGroup]="findForm" (ngSubmit)="find()" novalidate>
          <p class="muted">Pas de code à retenir : votre téléphone et votre nom suffisent.</p>
          <div class="grid cols-2">
            <div class="field"><label for="fp">Téléphone</label><input id="fp" class="input" type="tel" inputmode="tel" formControlName="phone" autocomplete="tel" /></div>
            <div class="field"><label for="fn">Votre nom</label><input id="fn" class="input" formControlName="name" autocomplete="name" />
              <span class="hint">Celui que vous avez écrit en passant la commande. Le prénom ou le nom seul suffit.</span></div>
          </div>
          @if (findError()) { <div class="notice error" role="alert">{{ findError() }}</div> }
          <button class="btn" type="submit" [disabled]="finding()">{{ finding() ? 'Recherche…' : 'Retrouver mes commandes' }}</button>
        </form>

        @if (found(); as list) {
          @if (!list.length) {
            <div class="notice warn mt" role="status">Aucune commande trouvée avec ce téléphone et ce nom. Essayez avec seulement votre prénom, ou vérifiez le numéro.</div>
          } @else {
            <div class="found-list mt" aria-live="polite">
              @for (f of list; track f.ref + f.createdAt) {
                <div class="found-order">
                  <div class="found-top"><strong>{{ f.ref }}</strong><app-status-badge [status]="f.status" /><app-pay-badge [paid]="f.paymentStatus" /></div>
                  @if (f.status !== 'ANNULEE') { <div class="acct-steps">@for (n of [1, 2, 3, 4]; track n) { <span [class.on]="n <= rank(f.status) + 1"></span> }</div> }
                  <div class="found-foot"><span class="muted small">{{ f.createdAt | date:'d MMM yyyy' }} · {{ f.itemCount }} article{{ f.itemCount > 1 ? 's' : '' }}</span><strong>{{ f.total | money:f.currency }}</strong></div>
                </div>
              }
            </div>
            <p class="hint mt-s">Pour voir le détail (articles, adresse) ou modifier une commande :
              @if (account.customer()) { <a routerLink="/mon-compte">ouvrez votre compte</a> } @else { <a routerLink="/connexion">connectez-vous à votre compte</a> }, ou utilisez l'onglet « Avec mon code ».</p>
          }
        }
      }

      @if (mode() === 'code') {
      <form class="card" [formGroup]="form" (ngSubmit)="search()" novalidate>
        <div class="field"><label for="no">Code complet ou numéro de commande</label><input id="no" class="input" formControlName="orderNumber" placeholder="CMD-XXXXXXXXXX" autocapitalize="characters" autocomplete="off" />
          <span class="hint">Il figure sur la page affichée après votre commande et dans les messages de la boutique.</span></div>
        <button class="btn" type="submit" [disabled]="loading()">Voir ma commande</button>
      </form>
      }
      @if (error()) { <div class="notice error mt" role="alert">{{ error() }}</div> }

      @if (!account.customer() && !order()) {
        <a class="track-help" routerLink="/connexion" [queryParams]="{retour: '/mon-compte'}">
          <span class="kpi-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg></span>
          <span><strong>Vous n'arrivez pas à retrouver votre commande ?</strong><small>Connectez-vous : toutes vos commandes s'affichent dans votre compte, sans code.</small></span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      }

      @if (order(); as o) {
        <section class="card mt" aria-live="polite">
          <div class="row between wrap gap"><h2>{{ o.orderNumber }}</h2><div class="row gap"><app-status-badge [status]="o.status" /><app-pay-badge [paid]="o.paymentStatus" /></div></div>
          <p class="muted small">Passée le {{ o.createdAt | date:'dd/MM/yyyy à HH:mm' }} · mise à jour automatique</p>
          @if (o.limited) {
            <div class="track-limited">
              <span>Vous consultez cette commande avec son numéro. Pour la <strong>modifier</strong> ou télécharger sa <strong>facture</strong> :</span>
              @if (account.customer()) { <a class="btn sm" routerLink="/mon-compte">Ouvrir mon compte</a> }
              @else { <a class="btn sm" routerLink="/connexion" [queryParams]="{retour: '/mon-compte'}">Me connecter</a> }
            </div>
          } @else {
          <p class="small">Code de suivi complet : <code class="code-inline">{{ o.trackingCode }}</code> <span class="muted">(il suffit seul pour retrouver cette commande : ne le partagez pas)</span></p>
          }

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
          @if (!o.limited) { <p class="muted small">{{ o.deliveryRequested ? 'Livraison' : 'Adresse' }} : {{ o.deliveryAddress }}</p> }

          <div class="track-actions">
            @if (o.canEdit && !editing()) {
              <button type="button" class="btn btn-edit" (click)="startEdit(o)">
                <span class="btn-edit-ico" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4.5L19.3 9.2a2.1 2.1 0 0 0 0-3l-1.5-1.5a2.1 2.1 0 0 0-3 0L4 15.5V20Z"/><path d="m13.5 6 4.5 4.5"/></svg></span>
                <span class="btn-edit-txt"><strong>Modifier ma commande</strong><small>Adresse, livraison, message</small></span>
              </button>
            }
            @if (wa(o); as link) {
              <a class="btn wa" [href]="link" target="_blank" rel="noopener">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z"/></svg>
                Continuer sur WhatsApp
              </a>
            }
            @if (!o.limited) {
              <button type="button" class="btn ghost" (click)="invoice(o)" [disabled]="pdfBusy()">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/><path d="M12 12v5m-2.5-2.5L12 17l2.5-2.5"/></svg>
                Télécharger ma facture
              </button>
            }
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
                @if (deliver()) { <p class="hint">La boutique vous indique les frais de livraison : vous les verrez ici.</p> }
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
  account = inject(CustomerAuthService);
  /** « simple » : téléphone + nom (résumé) ; « code » : code complet ou numéro + téléphone (détail complet). */
  mode = signal<'simple' | 'code'>('simple');
  findForm = this.fb.nonNullable.group({ phone: ['', [Validators.required, Validators.pattern(/^[+0-9 ().-]{6,25}$/)]], name: ['', [Validators.required, Validators.minLength(2)]] });
  found = signal<FoundOrder[] | null>(null); finding = signal(false); findError = signal('');
  private timer: any;
  form = this.fb.nonNullable.group({ orderNumber: ['', Validators.required] });
  /** Moyen d'accès en cours : code complet ou numéro de commande (jamais le téléphone seul). */
  private access: Access | null = null;
  rank = (s: OrderStatus) => STEPS.findIndex((x) => x.status === s);

  // Modification par le client
  editing = signal(false); saving = signal(false); editError = signal('');
  gender = signal<'HOMME' | 'FEMME' | null>(null); deliver = signal(false);
  private locChanged = false; private newLoc: PickedLocation | null = null;
  editForm = this.fb.nonNullable.group({ customerName: ['', [Validators.required, Validators.minLength(2)]], deliveryAddress: [''], comment: [''] });

  async find() {
    this.findError.set('');
    if (this.findForm.invalid) { this.findError.set('Indiquez votre téléphone et le nom donné à la commande.'); return; }
    this.finding.set(true);
    try { this.found.set((await this.api.post<{ items: FoundOrder[] }>('/orders/find', this.findForm.getRawValue())).items); }
    catch (e) { const err = toApiError(e); this.findError.set(err.details?.[0]?.message ?? err.message); }
    this.finding.set(false);
  }

  ngOnInit() {
    // Lien /suivi#CMD-…-… : le code est après « # », il n'est jamais envoyé au serveur dans l'adresse.
    const fragment = (this.route.snapshot.fragment || '').trim().toUpperCase();
    const n = this.route.snapshot.queryParamMap.get('n');
    const saved = this.mine.orders();
    if (FULL_CODE.test(fragment) || n) this.mode.set('code');
    if (FULL_CODE.test(fragment)) {
      this.form.patchValue({ orderNumber: fragment });
      this.fetch({ code: fragment });
    } else if (n) {
      const s = saved.find((o) => o.orderNumber === n);
      this.form.patchValue({ orderNumber: n });
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
    if (!ref) { this.order.set(null); this.error.set('Saisissez le code complet ou le numéro de la commande.'); return; }
    this.fetch({ orderNumber: ref });
  }
  openSaved(s: SavedOrder) {
    this.editing.set(false);
    this.form.patchValue({ orderNumber: s.trackingCode ?? s.orderNumber });
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
    this.gender.set(o.customerGender); this.deliver.set(o.deliveryRequested);
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
      comment: v.comment.trim(), deliveryRequested: this.deliver(), deliveryFeeAccepted: this.deliver(),
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
      // En consultation limitée (numéro seul), le serveur ne renvoie pas ce code : on garde le numéro.
      this.access = o.trackingCode ? { code: o.trackingCode } : access;
      this.order.set(o); this.statuses.update((m) => ({ ...m, [o.orderNumber]: o.status }));
    } catch (e) { if (!silent) { this.order.set(null); const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); } }
    this.loading.set(false);
  }
}
