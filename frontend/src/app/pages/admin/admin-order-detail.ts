import { Component, OnInit, inject, input, signal } from '@angular/core';
import { DatePipe, LowerCasePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { AdminCountersService } from '../../core/admin-counters.service';
import { ToastService } from '../../core/toast.service';
import { AdminOrder, OrderStatus, STATUS_ACTIONS } from '../../core/models';
import { AttrsPipe, ImgPipe, MoneyPipe, StatusLabelPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';
import { ConfirmDialog } from '../../shared/confirm-dialog';

@Component({
  selector: 'app-admin-order-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, LowerCasePipe, MoneyPipe, AttrsPipe, ImgPipe, StatusBadge, PayBadge, StatusLabelPipe, ConfirmDialog],
  template: `
    <a routerLink="/admin/commandes" class="small">← Retour aux commandes</a>
    @if (loading()) { <div class="spinner"></div> }
    @else if (o(); as o) {
      <div class="row between wrap gap mt"><h1>{{ o.orderNumber }}</h1><div class="row gap"><app-status-badge [status]="o.status" /><app-pay-badge [paid]="o.paymentStatus" /></div></div>
      <p class="muted">Créée le {{ o.createdAt | date:'dd/MM/yyyy à HH:mm' }}</p>

      <section class="card actions">
        <h2>Actions</h2>
        <div class="row gap wrap">
          @for (s of o.allowedStatuses; track s) {
            @if (s === 'ANNULEE') { <button class="btn danger-ghost" [disabled]="busy()" (click)="askCancel.set(true)">Annuler la commande</button> }
            @else { <button class="btn" [disabled]="busy()" (click)="change(s)">{{ actions[s] }}</button> }
          }
          @if (!o.allowedStatuses.length) { <span class="muted">Cette commande est {{ o.status | statusLabel | lowercase }} : plus de changement de statut possible.</span> }
        </div>
        <hr class="sep" />
        <div class="row gap wrap">
          @if (o.status !== 'ANNULEE') {
            @if (o.paymentStatus === 'NON_PAYE') {
              <button class="btn ok" [disabled]="busy()" (click)="askPaid.set(true)">Marquer comme payée</button>
            } @else {
              <span class="notice ok">Payée le {{ o.paidAt | date:'dd/MM/yyyy' }} @if (o.paidBy) { (par {{ o.paidBy }}) } @if (o.paymentNote) { · {{ o.paymentNote }} }</span>
              <button class="btn ghost sm" [disabled]="busy()" (click)="unpay()">Annuler le paiement</button>
            }
          } @else { <span class="muted small">Commande annulée : le stock a été remis en vente.</span> }
        </div>
      </section>

      <div class="grid cols-2 mt">
        <section class="card"><h2>Client</h2>
          <p><strong>{{ o.customerName }}</strong><br /><a [href]="'tel:' + o.customerPhone">{{ o.customerPhone }}</a></p>
          <p class="muted small">Livraison / retrait</p><p>{{ o.deliveryAddress }}@if (o.city) { <br />{{ o.city }} }</p>
          @if (o.comment) { <p class="muted small">Commentaire</p><p>{{ o.comment }}</p> }
        </section>
        <section class="card"><h2>Historique</h2>
          <ul class="timeline">
            @for (h of o.history; track h.id) {
              <li><strong>@if (h.type === 'PAYMENT') { Paiement : {{ h.to === 'PAYE' ? 'payée' : 'non payée' }} } @else { {{ h.to | statusLabel }} }</strong>
                <div class="muted small">{{ h.at | date:'dd/MM/yyyy HH:mm' }} · {{ h.admin || 'Client' }}@if (h.comment) { · {{ h.comment }} }</div></li>
            }
          </ul>
        </section>
      </div>

      <section class="card mt"><h2>Articles</h2>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Article</th><th class="num">Prix unitaire</th><th class="num">Qté</th><th class="num">Sous-total</th></tr></thead>
          <tbody>@for (i of o.items; track i.id) {
            <tr><td><div class="row gap">
              <div class="thumb-sm">@if (i.imageUrl) { <img [src]="i.imageUrl | img" alt="" /> } @else { <div class="ph">{{ i.name.charAt(0) }}</div> }</div>
              <div><strong>{{ i.name }}</strong><div class="muted small">{{ i.attributes | attrs }}@if (i.sku) { · SKU {{ i.sku }} }</div></div></div></td>
              <td class="num">{{ i.unitPrice | money:o.currency }}</td><td class="num">{{ i.quantity }}</td><td class="num">{{ i.lineTotal | money:o.currency }}</td></tr>
          }</tbody>
          <tfoot><tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>{{ o.total | money:o.currency }}</strong></td></tr></tfoot></table></div>
      </section>

      @if (askCancel()) { <app-confirm title="Annuler cette commande ?" message="Le stock des articles sera remis en vente. Cette action est définitive." confirmLabel="Annuler la commande" [danger]="true" (confirm)="cancel()" (cancel)="askCancel.set(false)" /> }
      @if (askPaid()) { <app-confirm title="Marquer comme payée ?" message="Confirmez que le client a bien réglé cette commande ({{ o.total | money:o.currency }})." confirmLabel="Oui, payée" (confirm)="pay()" (cancel)="askPaid.set(false)" /> }
    }`,
})
export class AdminOrderDetail implements OnInit {
  id = input.required<string>();
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private counters = inject(AdminCountersService);
  actions = STATUS_ACTIONS;
  o = signal<AdminOrder | null>(null);
  loading = signal(true); busy = signal(false);
  askCancel = signal(false); askPaid = signal(false);

  async ngOnInit() {
    try { this.o.set(await this.api.get<AdminOrder>(`/admin/orders/${this.id()}`)); this.counters.refresh(); }
    catch (e) { this.toast.error(toApiError(e).message); }
    this.loading.set(false);
  }

  private async run(fn: () => Promise<AdminOrder>, ok: string) {
    this.busy.set(true);
    try { this.o.set(await fn()); this.toast.success(ok); this.counters.refresh(); }
    catch (e) { this.toast.error(toApiError(e).message); }
    this.busy.set(false);
  }
  change(status: OrderStatus) { return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/status`, { status }), 'Statut mis à jour : le client le voit aussitôt.'); }
  cancel() { this.askCancel.set(false); return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/status`, { status: 'ANNULEE' }), 'Commande annulée, stock restitué.'); }
  pay() { this.askPaid.set(false); return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/payment`, { paid: true }), 'Commande marquée comme payée.'); }
  unpay() { return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/payment`, { paid: false }), 'Paiement annulé.'); }
}
