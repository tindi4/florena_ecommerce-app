import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ApiService, toApiError } from '../../core/api.service';
import { AdminCountersService } from '../../core/admin-counters.service';
import { ToastService } from '../../core/toast.service';
import { AdminReview, ReviewStatus } from '../../core/models';
import { ConfirmDialog } from '../../shared/confirm-dialog';
import { ImgPipe } from '../../shared/pipes';
import { Stars } from '../../shared/stars';

interface ReviewPage { counts: { pending: number; published: number; refused: number }; items: AdminReview[]; page: number; totalPages: number; total: number; }

/** Avis clients : rien n'est visible sur le site avant d'être publié ici. */
@Component({
  selector: 'app-admin-reviews',
  standalone: true,
  imports: [DatePipe, Stars, ImgPipe, ConfirmDialog],
  template: `
    <h1>Avis clients</h1>
    <p class="muted">Seuls les clients ayant reçu l’article peuvent laisser un avis. Un avis n’apparaît sur le site qu’après votre accord.</p>
    <div class="tabs" role="tablist">
      <button role="tab" class="tab" [class.on]="status() === 'EN_ATTENTE'" (click)="setStatus('EN_ATTENTE')">À valider @if (counts().pending) { <span class="pill hot">{{ counts().pending }}</span> }</button>
      <button role="tab" class="tab" [class.on]="status() === 'PUBLIE'" (click)="setStatus('PUBLIE')">Publiés ({{ counts().published }})</button>
      <button role="tab" class="tab" [class.on]="status() === 'REFUSE'" (click)="setStatus('REFUSE')">Refusés ({{ counts().refused }})</button>
    </div>

    @if (loading()) { <div class="spinner"></div> }
    @else if (!data()?.items?.length) {
      <div class="empty card"><h3>{{ status() === 'EN_ATTENTE' ? 'Aucun avis en attente' : 'Aucun avis' }}</h3><p>{{ status() === 'EN_ATTENTE' ? 'Les nouveaux avis de vos clients apparaîtront ici.' : 'Rien à afficher.' }}</p></div>
    } @else {
      <div class="stack">
        @for (r of data()!.items; track r.id) {
          <article class="card flat adm-review" [class.todo]="r.status === 'EN_ATTENTE'">
            <div class="adm-review-product">
              <span class="adm-review-thumb">@if (r.product.imageUrl) { <img [src]="r.product.imageUrl | img" alt="" /> } @else { {{ r.product.name.charAt(0) }} }</span>
              <div><strong>{{ r.product.name }}</strong>
                <span class="muted small">{{ r.customer.name || r.author }} · <a [href]="'tel:' + r.customer.phone">{{ r.customer.phone }}</a> · {{ r.updatedAt | date:'dd/MM/yyyy HH:mm' }}</span></div>
            </div>
            <div class="row gap" style="align-items:center"><app-stars [value]="r.rating" [size]="16" /><span class="small">{{ r.rating }}/5</span><span class="muted small">· affiché « {{ r.author }} »</span></div>
            <p class="adm-review-text">{{ r.comment }}</p>
            @if (r.photoUrl) { <a [href]="r.photoUrl | img" target="_blank" rel="noopener" class="adm-review-photo"><img [src]="r.photoUrl | img" alt="Photo jointe à l’avis" /></a> }

            @if (replying() === r.id) {
              <div class="field mt-s"><label [for]="'rp' + r.id">Réponse publique de la boutique</label>
                <textarea [id]="'rp' + r.id" class="input" rows="3" maxlength="600" [value]="replyText()" (input)="replyText.set($any($event.target).value)" placeholder="Merci pour votre avis…"></textarea></div>
              <div class="row gap wrap"><button type="button" class="btn sm" (click)="saveReply(r)">Enregistrer la réponse</button><button type="button" class="btn sm ghost" (click)="replying.set(null)">Annuler</button></div>
            } @else if (r.reply) {
              <div class="rv-reply"><strong>Votre réponse</strong><p>{{ r.reply }}</p></div>
            }

            <div class="row between wrap gap mt-s">
              @switch (r.status) {
                @case ('EN_ATTENTE') { <span class="badge st-EN_ATTENTE">À valider</span> }
                @case ('PUBLIE') { <span class="badge st-TERMINEE">Publié</span> }
                @case ('REFUSE') { <span class="badge st-ANNULEE">Refusé</span> }
              }
              <div class="row gap wrap">
                @if (r.status !== 'PUBLIE') { <button type="button" class="btn sm ok" (click)="set(r, 'PUBLIE')" [disabled]="busy()">Publier</button> }
                @if (r.status !== 'REFUSE') { <button type="button" class="btn sm ghost" (click)="set(r, 'REFUSE')" [disabled]="busy()">{{ r.status === 'PUBLIE' ? 'Retirer du site' : 'Refuser' }}</button> }
                @if (replying() !== r.id) { <button type="button" class="btn sm ghost" (click)="startReply(r)">{{ r.reply ? 'Modifier la réponse' : 'Répondre' }}</button> }
                <button type="button" class="btn sm danger-ghost" (click)="toDelete.set(r)">Supprimer</button>
              </div>
            </div>
          </article>
        }
      </div>
      @if (data()!.totalPages > 1) {
        <div class="row gap mt" style="justify-content:center">
          <button class="btn sm ghost" [disabled]="page() <= 1" (click)="go(page() - 1)">Précédent</button>
          <span class="small" style="align-self:center">Page {{ page() }} / {{ data()!.totalPages }}</span>
          <button class="btn sm ghost" [disabled]="page() >= data()!.totalPages" (click)="go(page() + 1)">Suivant</button>
        </div>
      }
    }
    @if (toDelete(); as r) {
      <app-confirm title="Supprimer cet avis ?" message="L’avis et sa photo seront effacés définitivement. Le client pourra en écrire un nouveau." confirmLabel="Supprimer" [danger]="true" (confirm)="remove(r)" (cancel)="toDelete.set(null)" />
    }`,
})
export class AdminReviews implements OnInit {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private counters = inject(AdminCountersService);
  data = signal<ReviewPage | null>(null);
  counts = signal({ pending: 0, published: 0, refused: 0 });
  status = signal<ReviewStatus>('EN_ATTENTE');
  page = signal(1);
  loading = signal(true); busy = signal(false);
  replying = signal<number | null>(null); replyText = signal('');
  toDelete = signal<AdminReview | null>(null);

  ngOnInit() { this.load(); }
  setStatus(s: ReviewStatus) { this.status.set(s); this.page.set(1); this.load(); }
  go(p: number) { this.page.set(p); this.load(); }

  async load() {
    this.loading.set(true);
    try { const r = await this.api.get<ReviewPage>('/admin/reviews', { status: this.status(), page: this.page() }); this.data.set(r); this.counts.set(r.counts); }
    catch (e) { this.toast.error(toApiError(e).message); }
    this.loading.set(false);
  }
  async set(r: AdminReview, status: ReviewStatus) {
    this.busy.set(true);
    try {
      await this.api.patch(`/admin/reviews/${r.id}`, { status });
      this.toast.success(status === 'PUBLIE' ? 'Avis publié sur le site.' : 'Avis retiré du site.');
      await this.load(); this.counters.refresh();
    } catch (e) { this.toast.error(toApiError(e).message); }
    this.busy.set(false);
  }
  startReply(r: AdminReview) { this.replyText.set(r.reply ?? ''); this.replying.set(r.id); }
  async saveReply(r: AdminReview) {
    try { await this.api.patch(`/admin/reviews/${r.id}`, { reply: this.replyText().trim() || null }); this.replying.set(null); this.toast.success('Réponse enregistrée.'); await this.load(); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }
  async remove(r: AdminReview) {
    this.toDelete.set(null);
    try { await this.api.delete(`/admin/reviews/${r.id}`); this.toast.success('Avis supprimé.'); await this.load(); this.counters.refresh(); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }
}
