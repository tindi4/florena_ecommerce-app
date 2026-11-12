import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, toApiError } from '../../core/api.service';
import { AdminCountersService } from '../../core/admin-counters.service';
import { ToastService } from '../../core/toast.service';
import { CustomerMessage, Paged } from '../../core/models';

@Component({
  selector: 'app-admin-messages',
  standalone: true,
  imports: [DatePipe],
  template: `
    <h1>Messages des clients</h1>
    <div class="tabs" role="tablist">
      <button role="tab" class="tab" [class.on]="status() === 'NOUVEAU'" (click)="setStatus('NOUVEAU')">À traiter</button>
      <button role="tab" class="tab" [class.on]="status() === 'TRAITE'" (click)="setStatus('TRAITE')">Traités</button>
      <button role="tab" class="tab" [class.on]="status() === ''" (click)="setStatus('')">Tous</button>
    </div>
    @if (loading()) { <div class="spinner"></div> }
    @else if (!data()?.items?.length) { <div class="empty card"><h3>Aucun message</h3><p>{{ status() === 'NOUVEAU' ? 'Tous les messages ont été traités.' : 'Rien à afficher.' }}</p></div> }
    @else {
      <div class="stack">
        @for (m of data()!.items; track m.id) {
          <article class="card flat msg" [class.todo]="m.status === 'NOUVEAU'">
            <div class="row between wrap gap"><strong>{{ m.name }}</strong><span class="muted small">{{ m.createdAt | date:'dd/MM/yyyy HH:mm' }}</span></div>
            <p class="msg-body">{{ m.message }}</p>
            <div class="row gap wrap small">
              @if (m.phone) { <a [href]="'tel:' + m.phone">📞 {{ m.phone }}</a> }
              @if (m.email) { <a [href]="'mailto:' + m.email">✉️ {{ m.email }}</a> }
              @if (m.orderNumber) { <span class="muted">Commande {{ m.orderNumber }}</span> }
            </div>
            <div class="row between wrap gap mt-s">
              @if (m.status === 'TRAITE') { <span class="badge st-TERMINEE">Traité{{ m.handledBy ? ' par ' + m.handledBy : '' }}</span> } @else { <span class="badge st-EN_ATTENTE">À traiter</span> }
              @if (m.status === 'NOUVEAU') { <button class="btn sm ok" (click)="set(m, 'TRAITE')">Marquer comme traité</button> }
              @else { <button class="btn sm ghost" (click)="set(m, 'NOUVEAU')">Rouvrir</button> }
            </div>
          </article>
        }
      </div>
    }`,
})
export class AdminMessages implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private counters = inject(AdminCountersService);
  data = signal<Paged<CustomerMessage> | null>(null);
  status = signal<'NOUVEAU' | 'TRAITE' | ''>('NOUVEAU');
  loading = signal(true);
  ngOnInit() { this.load(); }
  setStatus(s: 'NOUVEAU' | 'TRAITE' | '') { this.status.set(s); this.load(); }
  async load() {
    this.loading.set(true);
    try { this.data.set(await this.api.get<Paged<CustomerMessage>>('/admin/messages', { status: this.status(), limit: 50 })); } catch { /* ignore */ }
    this.loading.set(false);
  }
  async set(m: CustomerMessage, status: 'NOUVEAU' | 'TRAITE') {
    try { await this.api.patch(`/admin/messages/${m.id}/status`, { status }); this.counters.refresh(); await this.load(); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }
}
