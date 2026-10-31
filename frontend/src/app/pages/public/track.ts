import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { MyOrdersService } from '../../core/my-orders.service';
import { OrderStatus, TrackedOrder } from '../../core/models';
import { AttrsPipe, MoneyPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';
import { DatePipe } from '@angular/common';

const STEPS: { status: OrderStatus; label: string; hint: string }[] = [
  { status: 'EN_ATTENTE', label: 'Commande reçue', hint: 'Nous avons bien reçu votre commande.' },
  { status: 'CONFIRMEE', label: 'Confirmée', hint: 'Votre commande est validée par la boutique.' },
  { status: 'EN_PREPARATION', label: 'En préparation', hint: 'Nous préparons vos articles.' },
  { status: 'TERMINEE', label: 'Terminée', hint: 'Votre commande est terminée.' },
];

@Component({
  selector: 'app-track',
  standalone: true,
  imports: [ReactiveFormsModule, StatusBadge, PayBadge, MoneyPipe, AttrsPipe, DatePipe],
  template: `
    <div class="container section narrow">
      <h1>Suivre ma commande</h1>
      <form class="card" [formGroup]="form" (ngSubmit)="search()" novalidate>
        <div class="grid cols-2">
          <div class="field"><label for="no">Numéro de commande</label><input id="no" class="input" formControlName="orderNumber" placeholder="CMD-XXXXXXXXXX" autocapitalize="characters" /></div>
          <div class="field"><label for="ph">Téléphone utilisé pour la commande</label><input id="ph" class="input" type="tel" formControlName="phone" inputmode="tel" /></div>
        </div>
        <button class="btn" type="submit" [disabled]="loading()">Voir ma commande</button>
      </form>
      @if (error()) { <div class="notice error mt" role="alert">{{ error() }}</div> }

      @if (order(); as o) {
        <section class="card mt" aria-live="polite">
          <div class="row between wrap gap"><h2>{{ o.orderNumber }}</h2><div class="row gap"><app-status-badge [status]="o.status" /><app-pay-badge [paid]="o.paymentStatus" /></div></div>
          <p class="muted small">Passée le {{ o.createdAt | date:'dd/MM/yyyy à HH:mm' }} · mise à jour automatique</p>

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
          <div class="row between total"><span>Total</span><strong>{{ o.total | money:o.currency }}</strong></div>
          <p class="muted small">Livraison / retrait : {{ o.deliveryAddress }}{{ o.city ? ', ' + o.city : '' }}</p>
        </section>
      }

      @if (mine.orders().length) {
        <h2 class="mt">Mes commandes sur cet appareil</h2>
        <div class="stack">
          @for (s of mine.orders(); track s.orderNumber) {
            <button type="button" class="card flat saved" (click)="open(s.orderNumber, s.phone)">
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
  mine = inject(MyOrdersService);
  steps = STEPS;
  order = signal<TrackedOrder | null>(null);
  error = signal('');
  loading = signal(false);
  statuses = signal<Record<string, OrderStatus>>({});
  private timer: any;
  form = this.fb.nonNullable.group({ orderNumber: ['', Validators.required], phone: ['', Validators.required] });
  rank = (s: OrderStatus) => STEPS.findIndex((x) => x.status === s);

  ngOnInit() {
    const n = this.route.snapshot.queryParamMap.get('n');
    const saved = this.mine.orders();
    if (n) {
      const s = saved.find((o) => o.orderNumber === n);
      this.form.patchValue({ orderNumber: n, phone: s?.phone ?? '' });
      if (s) this.open(s.orderNumber, s.phone);
    }
    // Statuts en direct des commandes enregistrées sur l'appareil.
    saved.forEach(async (s) => {
      try { const o = await this.api.post<TrackedOrder>('/orders/track', { orderNumber: s.orderNumber, phone: s.phone }); this.statuses.update((m) => ({ ...m, [s.orderNumber]: o.status })); } catch { /* ignore */ }
    });
    this.timer = setInterval(() => { const o = this.order(); if (o) this.fetch(o.orderNumber, this.form.getRawValue().phone, true); }, 30000);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  search() { if (this.form.valid) { const v = this.form.getRawValue(); this.fetch(v.orderNumber.trim().toUpperCase(), v.phone); } }
  open(n: string, phone: string) { this.form.patchValue({ orderNumber: n, phone }); this.fetch(n, phone); }

  private async fetch(orderNumber: string, phone: string, silent = false) {
    if (!silent) { this.loading.set(true); this.error.set(''); }
    try {
      const o = await this.api.post<TrackedOrder>('/orders/track', { orderNumber, phone });
      this.order.set(o); this.statuses.update((m) => ({ ...m, [o.orderNumber]: o.status }));
    } catch (e) { if (!silent) { this.order.set(null); this.error.set(toApiError(e).message); } }
    this.loading.set(false);
  }
}
