import { Component, OnDestroy, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { ToastService } from '../../core/toast.service';
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
      @if (code(); as c) {
        <p class="small">Votre <strong>code de suivi complet</strong> (il suffit seul pour suivre la commande, gardez-le pour vous) :</p>
        <p class="code-box"><code>{{ c }}</code> <button type="button" class="btn ghost sm" (click)="copy(c)">Copier</button></p>
      }
      <p class="muted">Nous vous contactons très vite pour confirmer. Vous pouvez suivre l'avancement avec ce code, ou avec votre numéro de commande et votre téléphone.</p>
      @if (!account.customer()) {
        <div class="join-card">
          <span class="eyebrow">Espace client</span>
          <p>Gardez cette commande sous la main : avec un compte, toutes vos commandes sont réunies au même endroit, sans code à retenir.</p>
          <a class="arrow-link" routerLink="/connexion" [queryParams]="{mode: 'creer'}">Créer mon compte en une minute
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
        </div>
      }
      <div class="row gap wrap" style="justify-content:center"><a class="btn" routerLink="/suivi" [fragment]="code() ?? undefined" [queryParams]="code() ? {} : {n: number()}">Suivre ma commande</a>@if (wa(); as link) { <a class="btn wa" [href]="link" target="_blank" rel="noopener">💬 Continuer sur WhatsApp</a> }<a class="btn ghost" routerLink="/catalogue">Continuer mes achats</a></div>
    </div>`,
})
export class Confirmation implements OnInit {
  number = input.required<string>();
  private api = inject(ApiService);
  private mine = inject(MyOrdersService);
  private cfg = inject(ConfigService);
  wa = () => this.cfg.whatsappLink(`Bonjour, je viens de passer la commande ${this.number()}.`);
  account = inject(CustomerAuthService);
  private toast = inject(ToastService);
  order = signal<TrackedOrder | null>(null);
  code = signal<string | null>(null);
  async ngOnInit() {
    const saved = this.mine.orders().find((o) => o.orderNumber === this.number());
    if (!saved) return;
    this.code.set(saved.trackingCode ?? null);
    const access = saved.trackingCode ? { code: saved.trackingCode } : { orderNumber: saved.orderNumber, phone: saved.phone };
    try { const o = await this.api.post<TrackedOrder>('/orders/track', access); this.order.set(o); this.code.set(o.trackingCode); } catch { /* facultatif */ }
  }
  async copy(text: string) {
    try { await navigator.clipboard.writeText(text); this.toast.success('Code copié.'); } catch { this.toast.error('Copie impossible : sélectionnez le code à la main.'); }
  }
}
