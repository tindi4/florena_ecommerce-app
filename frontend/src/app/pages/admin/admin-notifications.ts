import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AdminCountersService } from '../../core/admin-counters.service';
import { AdminNotification, Paged } from '../../core/models';

@Component({
  selector: 'app-admin-notifications',
  standalone: true,
  imports: [DatePipe],
  template: `
    <div class="row between wrap gap"><h1>Notifications</h1><button class="btn ghost sm" (click)="readAll()" [disabled]="!hasUnread()">Tout marquer comme lu</button></div>
    <div class="tabs" role="tablist">
      <button role="tab" class="tab" [class.on]="filter() === 'unread'" (click)="setFilter('unread')">Non lues</button>
      <button role="tab" class="tab" [class.on]="filter() === 'read'" (click)="setFilter('read')">Déjà vues</button>
      <button role="tab" class="tab" [class.on]="filter() === 'all'" (click)="setFilter('all')">Toutes</button>
    </div>
    @if (loading()) { <div class="spinner"></div> }
    @else if (!data()?.items?.length) { <div class="empty card"><h3>{{ filter() === 'unread' ? 'Tout est à jour' : 'Aucune notification' }}</h3><p>Les nouvelles commandes et les nouveaux messages apparaîtront ici.</p></div> }
    @else {
      <div class="stack">
        @for (n of data()!.items; track n.id) {
          <button type="button" class="notif" [class.unread]="!n.isRead" (click)="open(n)">
            <span class="notif-ico" aria-hidden="true">{{ n.type === 'NEW_ORDER' ? '🛒' : '✉️' }}</span>
            <span class="notif-txt"><strong>{{ n.title }}</strong><span class="muted small">{{ n.body }}</span></span>
            <span class="muted small">{{ n.createdAt | date:'dd/MM HH:mm' }}</span>
            @if (!n.isRead) { <span class="dot-unread" aria-label="Non lue"></span> }
          </button>
        }
      </div>
    }`,
})
export class AdminNotifications implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private router = inject(Router);
  private counters = inject(AdminCountersService);
  data = signal<Paged<AdminNotification> | null>(null);
  filter = signal<'unread' | 'read' | 'all'>('unread');
  loading = signal(true);
  private timer: any;
  hasUnread = () => (this.data()?.items ?? []).some((n) => !n.isRead);

  ngOnInit() { this.load(true); this.timer = setInterval(() => this.load(false), 20000); }
  ngOnDestroy() { clearInterval(this.timer); }
  async load(spinner: boolean) {
    if (spinner) this.loading.set(true);
    try { this.data.set(await this.api.get<Paged<AdminNotification>>('/admin/notifications', { filter: this.filter(), limit: 50 })); } catch { /* ignore */ }
    this.loading.set(false);
  }
  setFilter(f: 'unread' | 'read' | 'all') { this.filter.set(f); this.load(true); }
  async readAll() { await this.api.post('/admin/notifications/read-all', {}); this.counters.refresh(); this.load(false); }
  async open(n: AdminNotification) {
    if (!n.isRead) { try { await this.api.patch(`/admin/notifications/${n.id}/read`, {}); } catch { /* ignore */ } this.counters.refresh(); }
    if (n.orderId) this.router.navigate(['/admin/commandes', n.orderId]);
    else this.router.navigate(['/admin/messages']);
  }
}
