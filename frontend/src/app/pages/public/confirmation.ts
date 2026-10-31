import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { MyOrdersService } from '../../core/my-orders.service';
import { TrackedOrder } from '../../core/models';
import { StatusBadge } from '../../shared/status-badge';

@Component({
  selector: 'app-confirmation',
  standalone: true,
  imports: [RouterLink, StatusBadge],
  template: `
    <div class="container section narrow center">
      <div class="check-mark" aria-hidden="true">✓</div>
      <h1>Commande enregistrée</h1>
      <p>Merci ! Gardez précieusement votre numéro de commande :</p>
      <p class="order-no">{{ number() }}</p>
      @if (order(); as o) { <p>Statut actuel : <app-status-badge [status]="o.status" /></p> }
      <p class="muted">Nous vous contactons très vite pour confirmer. Vous pouvez suivre l'avancement à tout moment avec votre numéro de commande et votre téléphone.</p>
      <div class="row gap wrap" style="justify-content:center"><a class="btn" routerLink="/suivi" [queryParams]="{n: number()}">Suivre ma commande</a><a class="btn ghost" routerLink="/catalogue">Continuer mes achats</a></div>
    </div>`,
})
export class Confirmation implements OnInit {
  number = input.required<string>();
  private api = inject(ApiService);
  private mine = inject(MyOrdersService);
  order = signal<TrackedOrder | null>(null);
  async ngOnInit() {
    const saved = this.mine.orders().find((o) => o.orderNumber === this.number());
    if (!saved) return;
    try { this.order.set(await this.api.post<TrackedOrder>('/orders/track', { orderNumber: saved.orderNumber, phone: saved.phone })); } catch { /* facultatif */ }
  }
}
