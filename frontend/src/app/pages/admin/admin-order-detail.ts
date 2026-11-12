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
import { OrderEditDialog } from '../../shared/order-edit-dialog';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-admin-order-detail',
  standalone: true,
  imports: [RouterLink, DatePipe, LowerCasePipe, MoneyPipe, AttrsPipe, ImgPipe, StatusBadge, PayBadge, StatusLabelPipe, ConfirmDialog, OrderEditDialog],
  template: `
    <a routerLink="/admin/commandes" class="small">← Retour aux commandes</a>
    @if (loading()) { <div class="spinner"></div> }
    @else if (o(); as o) {
      <div class="row between wrap gap mt"><h1>{{ o.orderNumber }}</h1><div class="row gap"><app-status-badge [status]="o.status" /><app-pay-badge [paid]="o.paymentStatus" /></div></div>
      <p class="muted">Créée le {{ o.createdAt | date:'dd/MM/yyyy à HH:mm' }}</p>

      <section class="card actions">
        <div class="row between wrap gap"><h2>Actions</h2><div class="row gap wrap">@if (auth.can('orders.edit')) { <button type="button" class="btn sm" (click)="editing.set(true)">✏️ Modifier la commande</button> }<button type="button" class="btn ghost sm" (click)="openInvoice()">📄 Facture / bon de commande (PDF)</button></div></div>
        <div class="row gap wrap">
          @for (s of o.allowedStatuses; track s) {
            @if (s === 'ANNULEE') { @if (auth.can('orders.cancel')) { <button class="btn danger-ghost" [disabled]="busy()" (click)="askCancel.set(true)">Annuler la commande</button> } }
            @else if (auth.can('orders.status')) { <button class="btn" [disabled]="busy()" (click)="change(s)">{{ actions[s] }}</button> }
          }
          @if (!o.allowedStatuses.length) { <span class="muted">Cette commande est {{ o.status | statusLabel | lowercase }} : plus de changement de statut possible.</span> }
          @else if (!auth.can('orders.status', 'orders.cancel')) { <span class="muted small">Votre rôle ne permet pas de changer le statut.</span> }
        </div>
        <hr class="sep" />
        <div class="row gap wrap">
          @if (o.status !== 'ANNULEE') {
            @if (o.paymentStatus === 'NON_PAYE') {
              @if (auth.can('orders.payment')) { <button class="btn ok" [disabled]="busy()" (click)="askPaid.set(true)">Marquer comme payée</button> }
              @else { <span class="badge pay-no">Non payée</span> }
            } @else {
              <span class="notice ok">Payée le {{ o.paidAt | date:'dd/MM/yyyy' }} @if (o.paidBy) { (par {{ o.paidBy }}) } @if (o.paymentNote) { · {{ o.paymentNote }} }</span>
              @if (auth.can('orders.payment')) { <button class="btn ghost sm" [disabled]="busy()" (click)="unpay()">Annuler le paiement</button> }
            }
          } @else { <span class="muted small">Commande annulée : le stock a été remis en vente.</span> }
        </div>
      </section>

      @if (o.customerEditedAt) { <div class="notice warn mt">✏️ Le client a modifié sa commande le {{ o.customerEditedAt | date:'dd/MM/yyyy à HH:mm' }} (voir l'historique).</div> }

      <section class="card mt">
        <h2>Livraison</h2>
        @if (o.deliveryRequested) {
          <p>Le client demande la <strong>livraison</strong>@if (o.deliveryFeeAccepted) { et a coché « Ajouter les frais de livraison » }.</p>
        } @else { <p class="muted">Le client n'a pas demandé la livraison (retrait sur place). Vous pouvez tout de même ajouter des frais si besoin.</p> }
        @if (o.deliveryFeeStatus === 'SET') { <p class="notice ok">Frais fixés : <strong>{{ o.deliveryFee | money:o.currency }}</strong>. Total client : {{ o.total | money:o.currency }}.</p> }
        @else if (o.deliveryFeeStatus === 'PENDING') { <p class="notice warn">Frais à fixer : le client attend le montant.</p> }
        @if (o.status !== 'TERMINEE' && o.status !== 'ANNULEE' && auth.can('orders.fee')) {
          <div class="row gap wrap">
            <button type="button" class="btn ghost" [disabled]="busy()" (click)="saveFee(o.suggestedFee)">Valider {{ o.suggestedFee | money:o.currency }}</button>
            <div class="field" style="margin:0"><label class="sr-only" for="fee">Montant des frais</label>
              <input id="fee" class="input" style="width:150px" type="number" min="0" step="50" [value]="fee()" (input)="fee.set(+$any($event.target).value)" /></div>
            <button type="button" class="btn" [disabled]="busy()" (click)="saveFee(fee())">Valider ce montant</button>
          </div>
          <p class="hint">Vous pouvez saisir n'importe quel montant (0 = livraison offerte). Le client le voit dans son suivi.</p>
        }
      </section>

      @if (o.status !== 'ANNULEE' && auth.can('orders.notify')) {
        <section class="card mt">
          <h2>Prévenir le client</h2>
          @if (o.confirmation.channel) { <p class="notice ok small">Dernier envoi : {{ o.confirmation.channel === 'WHATSAPP' ? 'WhatsApp' : 'SMS' }} le {{ o.confirmation.sentAt | date:'dd/MM/yyyy HH:mm' }}</p> }
          <div class="field"><label for="msg">Message (modifiable avant l'envoi)</label>
            <textarea id="msg" class="input" rows="4" [value]="message()" (input)="message.set($any($event.target).value)"></textarea></div>
          <div class="row gap wrap">
            <button type="button" class="btn wa" [disabled]="busy()" (click)="notifyClient('WHATSAPP')">💬 Envoyer par WhatsApp</button>
            <button type="button" class="btn ghost" [disabled]="busy()" (click)="notifyClient('SMS')">✉️ Envoyer par SMS</button>
          </div>
          @if (pendingLink(); as l) { <p class="small mt-s">Rien ne s'est ouvert ? <a [href]="l" target="_blank" rel="noopener">Cliquez ici pour ouvrir l'application</a>.</p> }
          <p class="hint">Vous choisissez le canal : le message s'ouvre dans votre WhatsApp ou votre application SMS, prêt à envoyer.</p>
        </section>
      }

      <div class="grid cols-2 mt">
        <section class="card"><h2>Client</h2>
          <p><strong>{{ o.customerName || 'Client sans nom' }}</strong>@if (o.customerGender) { <span class="muted"> · {{ o.customerGender === 'HOMME' ? 'Monsieur' : 'Madame' }}</span> }<br /><a [href]="'tel:' + o.customerPhone">{{ o.customerPhone }}</a></p>
          <p class="muted small">Livraison / retrait</p><p>{{ o.deliveryAddress }}@if (o.city) { <br />{{ o.city }} }</p>
          @if (o.mapsUrl) { <p><a class="btn sm ghost" [href]="o.mapsUrl" target="_blank" rel="noopener">📍 Voir sur Google Maps</a>@if (o.locationLabel) { <span class="muted small"> {{ o.locationLabel }}</span> }</p> }
          @if (o.comment) { <p class="muted small">Commentaire</p><p>{{ o.comment }}</p> }
        </section>
        <section class="card"><h2>Historique</h2>
          <ul class="timeline">
            @for (h of o.history; track h.id) {
              <li><strong>@if (h.type === 'PAYMENT') { Paiement : {{ h.to === 'PAYE' ? 'payée' : 'non payée' }} } @else if (h.type === 'NOTIFY') { Client prévenu par {{ h.to === 'WHATSAPP' ? 'WhatsApp' : 'SMS' }} } @else if (h.type === 'FEE') { Livraison : {{ h.from }} → {{ h.to }} } @else { {{ h.to | statusLabel }} }</strong>
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
          <tfoot>
            <tr><td colspan="3" class="num">Articles</td><td class="num">{{ o.subtotal | money:o.currency }}</td></tr>
            <tr><td colspan="3" class="num">Livraison</td><td class="num">@if (o.deliveryFeeStatus === 'SET') { {{ o.deliveryFee | money:o.currency }} } @else if (o.deliveryFeeStatus === 'PENDING') { <em>à fixer</em> } @else { — }</td></tr>
            <tr><td colspan="3" class="num"><strong>Total</strong></td><td class="num"><strong>{{ o.total | money:o.currency }}</strong></td></tr>
          </tfoot></table></div>
      </section>

      @if (editing()) { <app-order-edit-dialog [order]="o" (saved)="onEdited($event)" (closed)="editing.set(false)" /> }
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
  auth = inject(AuthService);
  editing = signal(false);
  askCancel = signal(false); askPaid = signal(false);
  fee = signal(0); message = signal(''); pendingLink = signal('');

  async ngOnInit() {
    try { this.setOrder(await this.api.get<AdminOrder>(`/admin/orders/${this.id()}`)); this.counters.refresh(); }
    catch (e) { this.toast.error(toApiError(e).message); }
    this.loading.set(false);
  }

  private async run(fn: () => Promise<AdminOrder>, ok: string) {
    this.busy.set(true);
    try { this.setOrder(await fn()); this.toast.success(ok); this.counters.refresh(); }
    catch (e) { this.toast.error(toApiError(e).message); }
    this.busy.set(false);
  }
  onEdited(o: AdminOrder) { this.setOrder(o); this.editing.set(false); this.counters.refresh(); }
  private setOrder(o: AdminOrder) {
    this.o.set(o);
    this.fee.set(o.deliveryFeeStatus === 'SET' ? o.deliveryFee : o.suggestedFee);
    if (!this.message()) this.message.set(o.confirmation.defaultMessage);
  }
  saveFee(amount: number) {
    if (!Number.isFinite(amount) || amount < 0) { this.toast.error('Montant invalide.'); return; }
    return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/delivery-fee`, { fee: Math.round(amount) }), 'Frais de livraison enregistrés : le client les voit dans son suivi.');
  }
  async notifyClient(channel: 'WHATSAPP' | 'SMS') {
    this.busy.set(true);
    try {
      const r = await this.api.post<{ url: string; channel: string }>(`/admin/orders/${this.id()}/notify`, { channel, message: this.message().trim() });
      this.pendingLink.set(r.url);
      if (channel === 'SMS') window.location.href = r.url; else window.open(r.url, '_blank');
      this.setOrder(await this.api.get<AdminOrder>(`/admin/orders/${this.id()}`));
      this.toast.success(channel === 'WHATSAPP' ? 'WhatsApp ouvert : envoyez le message.' : 'SMS prêt : envoyez le message.');
    } catch (e) { this.toast.error(toApiError(e).message); }
    this.busy.set(false);
  }
  async openInvoice() {
    try { const blob = await this.api.getBlob(`/admin/orders/${this.id()}/invoice`); window.open(URL.createObjectURL(blob), '_blank'); }
    catch { this.toast.error('Impossible de générer le PDF.'); }
  }
  change(status: OrderStatus) { return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/status`, { status }), 'Statut mis à jour : le client le voit aussitôt.'); }
  cancel() { this.askCancel.set(false); return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/status`, { status: 'ANNULEE' }), 'Commande annulée, stock restitué.'); }
  pay() { this.askPaid.set(false); return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/payment`, { paid: true }), 'Commande marquée comme payée.'); }
  unpay() { return this.run(() => this.api.patch<AdminOrder>(`/admin/orders/${this.id()}/payment`, { paid: false }), 'Paiement annulé.'); }
}
