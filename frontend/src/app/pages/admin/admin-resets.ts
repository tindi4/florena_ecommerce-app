import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, toApiError } from '../../core/api.service';
import { AdminCountersService } from '../../core/admin-counters.service';
import { ToastService } from '../../core/toast.service';
import { ResetConfirmation, ResetLink, ResetRequest } from '../../core/models';

type Status = ResetRequest['status'];
interface Page { counts: { pending: number; done: number; ignored: number }; items: ResetRequest[]; page: number; totalPages: number; }
const ACTIONS: Record<string, string> = {
  DEMANDE: 'Demande du client', CLIENT_CONTACTE: 'Message de vérification envoyé', LIEN_CREE: 'Lien créé', DEMANDE_IGNOREE: 'Demande ignorée', MOT_DE_PASSE_CHANGE: 'Mot de passe changé par le client',
};

/**
 * Demandes « mot de passe oublié », en 2 étapes, toujours vers le numéro WhatsApp du compte (affiché avant chaque envoi) :
 * 1. message « cette demande vient-elle bien de vous ? » (aucun lien) ;
 * 2. quand le client répond oui, lien à usage unique de 30 min, qu'il utilise aussitôt. Personne ne voit le mot de passe.
 */
@Component({
  selector: 'app-admin-resets',
  standalone: true,
  imports: [DatePipe],
  template: `
    <h1>Mots de passe oubliés</h1>
    <p class="muted">Deux étapes, toujours vers le numéro WhatsApp du compte : d’abord demander au client si la demande vient bien de lui, puis, quand il répond « Oui », lui envoyer le lien. Le client choisit lui-même son nouveau mot de passe.</p>
    <div class="tabs" role="tablist">
      <button role="tab" class="tab" [class.on]="status() === 'EN_ATTENTE'" (click)="setStatus('EN_ATTENTE')">En attente @if (data()?.counts?.pending) { <span class="pill hot">{{ data()!.counts.pending }}</span> }</button>
      <button role="tab" class="tab" [class.on]="status() === 'TRAITEE'" (click)="setStatus('TRAITEE')">Traitées</button>
      <button role="tab" class="tab" [class.on]="status() === 'IGNOREE'" (click)="setStatus('IGNOREE')">Ignorées</button>
    </div>

    @if (loading()) { <div class="spinner"></div> }
    @else if (!data()?.items?.length) {
      <div class="empty card"><h3>{{ status() === 'EN_ATTENTE' ? 'Aucune demande en attente' : 'Rien à afficher' }}</h3><p>Les demandes des clients qui ont oublié leur mot de passe apparaîtront ici.</p></div>
    } @else {
      <div class="stack">
        @for (r of data()!.items; track r.id) {
          <article class="card flat reset-req" [class.todo]="r.status === 'EN_ATTENTE'">
            <div class="reset-req-head">
              <span class="reset-req-ico" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>
              <div class="reset-req-who">
                <strong>{{ r.customer.name || 'Client sans nom' }}</strong>
                <span class="small">{{ r.customer.phone }}@if (r.customer.username) { · {{ r.customer.username }} }</span>
              </div>
              @if (r.requestCount > 1) { <span class="pill">{{ r.requestCount }} demandes</span> }
            </div>
            <p class="muted small">Demandé le {{ r.createdAt | date:'dd/MM/yyyy à HH:mm' }}@if (r.requestCount > 1) { · dernière fois le {{ r.lastRequestedAt | date:'dd/MM à HH:mm' }} }
              @if (r.handledAt) { · {{ r.status === 'TRAITEE' ? 'lien créé' : 'ignorée' }} le {{ r.handledAt | date:'dd/MM à HH:mm' }}@if (r.handledBy) { par {{ r.handledBy }} } }</p>

            @if (r.status === 'EN_ATTENTE') {
              <ol class="reset-flow">
                <li [class.done]="!!r.contactedAt" [class.now]="!r.contactedAt"><span>1</span>Vérifier auprès du client</li>
                <li [class.now]="!!r.contactedAt"><span>2</span>Envoyer le lien</li>
              </ol>
              @if (!r.contactedAt) {
                <div class="row gap wrap">
                  <button type="button" class="btn sm wa" (click)="preview(r)" [disabled]="busy()">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z"/></svg>
                    Écrire au client</button>
                  <button type="button" class="btn sm ghost" (click)="ignore(r)" [disabled]="busy()">Ignorer</button>
                </div>
              } @else {
                <p class="reset-wait small">Message envoyé le {{ r.contactedAt | date:'dd/MM à HH:mm' }}@if (r.contactedBy) {<span> par {{ r.contactedBy }}</span>}. En attente de sa réponse sur WhatsApp.</p>
                <div class="row gap wrap">
                  <button type="button" class="btn sm" (click)="confirm.set(r)">Le client a confirmé : créer le lien</button>
                  <button type="button" class="btn sm ghost" (click)="preview(r)" [disabled]="busy()">Renvoyer le message</button>
                  <button type="button" class="btn sm ghost" (click)="ignore(r)" [disabled]="busy()">Ce n’est pas lui · ignorer</button>
                </div>
              }
            }
            @if (r.history.length) {
              <details class="reset-log"><summary class="small">Journal ({{ r.history.length }})</summary>
                <ul>@for (h of r.history; track $index) { <li class="small"><span>{{ h.at | date:'dd/MM/yyyy HH:mm' }}</span> {{ label(h.action) }}@if (h.by) { · {{ h.by }} }</li> }</ul>
              </details>
            }
          </article>
        }
      </div>
    }

    <!-- Étape 1 : message de vérification, sans lien, vers le numéro du compte -->
    @if (ask(); as a) {
      <div class="modal-backdrop" (click)="ask.set(null)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ra-t" (click)="$event.stopPropagation()">
          <h2 id="ra-t">Vérifier que la demande vient du client</h2>
          <div class="reset-phone"><span class="small muted">Message envoyé uniquement au numéro WhatsApp du compte</span><strong>{{ a.conf.phone }}</strong></div>
          <p class="small muted">Aperçu du message</p>
          <div class="reset-msg">{{ a.conf.message }}</div>
          <p class="hint">Aucun lien à cette étape. Quand le client répond « Oui », revenez ici pour créer le lien : il pourra l’utiliser tout de suite.</p>
          <div class="row gap wrap" style="justify-content:flex-end">
            <button type="button" class="btn ghost" (click)="ask.set(null)">Annuler</button>
            <a class="btn wa" [href]="a.conf.whatsappUrl" target="_blank" rel="noopener" (click)="contacted(a.req)">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z"/></svg>
              Envoyer sur WhatsApp au {{ a.conf.phone }}</a>
          </div>
        </div>
      </div>
    }

    <!-- Étape 2 : le client a répondu oui ; le numéro du compte est rappelé AVANT de créer le lien -->
    @if (confirm(); as r) {
      <div class="modal-backdrop" (click)="confirm.set(null)">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rc-t" (click)="$event.stopPropagation()">
          <h2 id="rc-t">Le client a bien répondu « Oui » ?</h2>
          <p>Créez le lien seulement si <strong>{{ r.customer.name || r.customer.username || 'le client' }}</strong> a confirmé depuis ce numéro :</p>
          <div class="reset-phone"><span class="small muted">Numéro WhatsApp du compte</span><strong>{{ r.customer.phone }}</strong></div>
          <p class="hint">Le lien sera valable 30 minutes : envoyez-le tout de suite, pendant que le client est disponible. Une réponse venue d’un autre numéro ne compte pas.</p>
          <div class="row gap wrap" style="justify-content:flex-end">
            <button type="button" class="btn ghost" (click)="confirm.set(null)">Pas encore</button>
            <button type="button" class="btn" (click)="create(r)" [disabled]="busy()">{{ busy() ? 'Création…' : 'Oui, créer le lien' }}</button>
          </div>
        </div>
      </div>
    }

    <!-- 2. Lien créé : affiché une seule fois, envoi WhatsApp vers le numéro du compte -->
    @if (created(); as c) {
      <div class="modal-backdrop">
        <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rl-t">
          <h2 id="rl-t">Lien prêt à envoyer</h2>
          <div class="reset-phone"><span class="small muted">Destinataire (numéro du compte)</span><strong>{{ c.phone }}</strong></div>
          <label class="small muted" for="rl-link">Lien à usage unique, valable jusqu’à {{ c.expiresAt | date:'HH:mm' }}</label>
          <input id="rl-link" class="input reset-link" [value]="c.link" readonly />
          <p class="small muted">Aperçu du message</p>
          <div class="reset-msg">{{ c.message }}</div>
          <p class="hint">Ce lien ne sera plus jamais affiché. S’il se perd ou expire, le client refait une demande.</p>
          <div class="row gap wrap" style="justify-content:flex-end">
            <button type="button" class="btn ghost" (click)="created.set(null)">Fermer</button>
            <a class="btn wa" [href]="c.whatsappUrl" target="_blank" rel="noopener" (click)="sentWa()">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z"/></svg>
              Envoyer par WhatsApp au {{ c.phone }}</a>
          </div>
        </div>
      </div>
    }`,
})
export class AdminResets implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private counters = inject(AdminCountersService);
  data = signal<Page | null>(null);
  status = signal<Status>('EN_ATTENTE');
  loading = signal(true); busy = signal(false);
  ask = signal<{ req: ResetRequest; conf: ResetConfirmation } | null>(null);
  confirm = signal<ResetRequest | null>(null);
  created = signal<ResetLink | null>(null);

  ngOnInit() { this.load(); }
  label(a: string) { return ACTIONS[a] ?? a; }
  setStatus(s: Status) { this.status.set(s); this.load(); }

  async load() {
    this.loading.set(true);
    try { this.data.set(await this.api.get<Page>('/admin/reset-requests', { status: this.status() })); }
    catch (e) { this.toast.error(toApiError(e).message); }
    this.loading.set(false);
  }
  /** Étape 1 : prépare le message de vérification (rien n'est enregistré tant que WhatsApp n'est pas ouvert). */
  async preview(r: ResetRequest) {
    this.busy.set(true);
    try { this.ask.set({ req: r, conf: await this.api.get<ResetConfirmation>(`/admin/reset-requests/${r.id}/confirmation`) }); }
    catch (e) { this.toast.error(toApiError(e).message); await this.load(); }
    this.busy.set(false);
  }
  async contacted(r: ResetRequest) {
    this.ask.set(null);
    try { await this.api.post(`/admin/reset-requests/${r.id}/contacted`); this.toast.success('WhatsApp ouvert : envoyez le message, puis attendez la réponse du client.'); }
    catch (e) { this.toast.error(toApiError(e).message); }
    await this.load();
  }
  async create(r: ResetRequest) {
    this.busy.set(true);
    try {
      this.created.set(await this.api.post<ResetLink>(`/admin/reset-requests/${r.id}/link`));
      this.confirm.set(null);
      await this.load(); this.counters.refresh();
    } catch (e) { this.toast.error(toApiError(e).message); this.confirm.set(null); await this.load(); }
    this.busy.set(false);
  }
  sentWa() { this.toast.success('WhatsApp ouvert : vérifiez le numéro puis envoyez le message.'); }
  async ignore(r: ResetRequest) {
    this.busy.set(true);
    try { await this.api.post(`/admin/reset-requests/${r.id}/ignore`); this.toast.success('Demande ignorée.'); await this.load(); this.counters.refresh(); }
    catch (e) { this.toast.error(toApiError(e).message); }
    this.busy.set(false);
  }
}
