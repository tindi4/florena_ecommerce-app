import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../core/api.service';
import { CustomerAuthService } from '../core/customer-auth.service';
import { MyReview, ReviewSummary } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ImgPipe } from './pipes';
import { StarInput, Stars } from './stars';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX = 5 * 1024 * 1024;

/**
 * Avis clients d'un article : note moyenne, répartition, liste des avis publiés,
 * et formulaire pour les clients qui ont reçu l'article (achat vérifié).
 */
@Component({
  selector: 'app-product-reviews',
  standalone: true,
  imports: [Stars, StarInput, DatePipe, RouterLink, ImgPipe],
  template: `
    <section class="reviews" id="avis" aria-labelledby="reviews-title">
      <header class="reviews-head">
        <div>
          <span class="eyebrow">Ils l’ont adopté</span>
          <h2 id="reviews-title">Avis clients</h2>
        </div>
      </header>

      <div class="reviews-grid">
        <aside class="reviews-summary">
          @if (data(); as d) {
            @if (d.count) {
              <div class="rv-score"><strong>{{ avg() }}</strong><span>/ 5</span></div>
              <app-stars [value]="d.average ?? 0" [size]="20" />
              <p class="muted small">{{ d.count }} avis · achats vérifiés</p>
              <ul class="rv-bars">
                @for (n of [5, 4, 3, 2, 1]; track n) {
                  <li><span>{{ n }}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 2.9 1.1-6.3L2.9 9.4l6.3-.9L12 2.8Z"/></svg>
                    <span class="rv-bar"><i [style.width.%]="pct(n)"></i></span><span class="rv-n">{{ d.distribution[n] || 0 }}</span></li>
                }
              </ul>
            } @else {
              <p class="rv-empty-title">Pas encore d’avis</p>
              <p class="muted small">Les avis sont réservés aux clientes et clients qui ont reçu cet article.</p>
            }
          }

          <!-- Donner son avis -->
          @if (!account.customer()) {
            <div class="rv-cta">
              <p class="small">Vous avez reçu cet article ?</p>
              <a class="btn ghost block" routerLink="/connexion" [queryParams]="{ retour: returnUrl() }">Se connecter pour donner mon avis</a>
            </div>
          } @else if (mine(); as m) {
            @if (m.review && !editing()) {
              <div class="rv-mine">
                <p class="small"><strong>Votre avis</strong> ·
                  @switch (m.review.status) {
                    @case ('EN_ATTENTE') { <span class="rv-status wait">en cours de validation</span> }
                    @case ('PUBLIE') { <span class="rv-status ok">publié</span> }
                    @case ('REFUSE') { <span class="rv-status no">non publié</span> }
                  }
                </p>
                <app-stars [value]="m.review.rating" />
                <p class="small rv-mine-text">{{ m.review.comment }}</p>
                <div class="row gap wrap">
                  <button type="button" class="btn ghost sm" (click)="startEdit()">Modifier</button>
                  <button type="button" class="link-btn small" (click)="remove()">Supprimer</button>
                </div>
              </div>
            } @else if (m.canReview && !editing()) {
              <div class="rv-cta">
                <p class="small">Vous avez reçu cet article : votre avis aide les autres clientes.</p>
                <button type="button" class="btn block" (click)="startEdit()">Donner mon avis</button>
              </div>
            } @else if (!m.canReview) {
              <p class="muted small rv-cta">{{ m.reason }}</p>
            }
          }
        </aside>

        <div class="reviews-main">
          @if (editing()) {
            <form class="rv-form" (submit)="$event.preventDefault(); send()" novalidate>
              <h3>{{ mine()?.review ? 'Modifier mon avis' : 'Votre avis sur cet article' }}</h3>
              <div class="field"><span class="rv-label">Votre note</span><app-star-input [(value)]="rating" /></div>
              <div class="field">
                <label for="rv-c" class="rv-label">Votre commentaire</label>
                <textarea id="rv-c" class="input" rows="4" maxlength="1000" [value]="comment()" (input)="comment.set($any($event.target).value)"
                  placeholder="Qualité, taille, confort, rendu par rapport aux photos…"></textarea>
                <span class="hint">{{ comment().trim().length }} / 1000 · 10 caractères minimum</span>
              </div>
              <div class="field">
                <span class="rv-label">Une photo <span class="muted">(facultatif)</span></span>
                <div class="rv-photo-row">
                  @if (preview(); as p) {
                    <span class="rv-photo-prev"><img [src]="p" alt="Votre photo" />
                      <button type="button" (click)="clearPhoto()" aria-label="Retirer la photo">×</button></span>
                  }
                  <label class="btn ghost sm" for="rv-f">{{ preview() ? 'Changer la photo' : 'Ajouter une photo' }}</label>
                  <input id="rv-f" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" (change)="pick($event)" />
                </div>
                <span class="hint">JPEG, PNG ou WebP, 5 Mo maximum.</span>
              </div>
              @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
              <p class="hint">Votre prénom et l’initiale de votre nom apparaîtront avec l’avis, après validation par la boutique.</p>
              <div class="row gap wrap">
                <button class="btn" type="submit" [disabled]="sending()">{{ sending() ? 'Envoi…' : 'Publier mon avis' }}</button>
                <button class="btn ghost" type="button" (click)="cancel()">Annuler</button>
              </div>
            </form>
          }

          @if (data(); as d) {
            @if (d.count > 1) {
              <div class="rv-sort" role="group" aria-label="Trier les avis">
                <button type="button" class="chip" [class.on]="sort() === 'recent'" (click)="setSort('recent')">Plus récents</button>
                <button type="button" class="chip" [class.on]="sort() === 'best'" (click)="setSort('best')">Meilleures notes</button>
                <button type="button" class="chip" [class.on]="sort() === 'worst'" (click)="setSort('worst')">Notes les plus basses</button>
              </div>
            }
            <div class="rv-list">
              @for (r of d.items; track r.id) {
                <article class="rv-item">
                  <div class="rv-item-head">
                    <span class="rv-avatar" aria-hidden="true">{{ r.author.charAt(0) }}</span>
                    <div><strong>{{ r.author }}</strong>
                      <span class="rv-verified"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>Achat vérifié</span></div>
                    <span class="muted small rv-date">{{ r.createdAt | date:'d MMM yyyy' }}</span>
                  </div>
                  <app-stars [value]="r.rating" [size]="14" />
                  <p class="rv-text">{{ r.comment }}</p>
                  @if (r.photoUrl) {
                    <button type="button" class="rv-photo" (click)="zoom.set(r.photoUrl)" aria-label="Agrandir la photo"><img [src]="r.photoUrl | img" alt="Photo de la cliente" loading="lazy" /></button>
                  }
                  @if (r.reply) { <div class="rv-reply"><strong>Réponse de la boutique</strong><p>{{ r.reply }}</p></div> }
                </article>
              }
            </div>
            @if (d.page < d.totalPages) { <button type="button" class="btn ghost" (click)="more()" [disabled]="loadingMore()">Voir plus d’avis</button> }
          }
        </div>
      </div>

      @if (zoom(); as z) {
        <div class="modal-backdrop" (click)="zoom.set(null)"><img class="rv-zoom" [src]="z | img" alt="Photo de l’avis" /></div>
      }
    </section>`,
})
export class ProductReviews {
  slug = input.required<string>();
  /** Note moyenne et nombre d'avis, affichés aussi sous le nom de l'article. */
  summary = output<{ average: number | null; count: number }>();
  private api = inject(ApiService);
  private toast = inject(ToastService);
  account = inject(CustomerAuthService);

  data = signal<ReviewSummary | null>(null);
  mine = signal<MyReview | null>(null);
  sort = signal<'recent' | 'best' | 'worst'>('recent');
  editing = signal(false); sending = signal(false); loadingMore = signal(false);
  error = signal('');
  rating = signal(0); comment = signal('');
  photo = signal<File | null>(null); removePhoto = signal(false); existingPhoto = signal<string | null>(null);
  zoom = signal<string | null>(null);
  preview = computed(() => { const f = this.photo(); return f ? URL.createObjectURL(f) : this.removePhoto() ? null : this.existingPhoto(); });
  avg = computed(() => String(this.data()?.average ?? '').replace('.', ','));
  returnUrl = computed(() => `/produit/${this.slug()}#avis`);

  constructor() {
    effect(() => { const s = this.slug(); this.load(s); });
    // « Mon avis » seulement pour un client connecté (sinon la requête renverrait vers la connexion).
    effect(() => { const c = this.account.customer(); const s = this.slug(); if (c) this.loadMine(s); else this.mine.set(null); });
    this.account.restore();
  }

  pct(n: number) { const d = this.data(); return d && d.count ? Math.round(((d.distribution[n] || 0) / d.count) * 100) : 0; }

  private async load(slug: string, page = 1) {
    try {
      const r = await this.api.get<ReviewSummary>(`/products/${slug}/reviews`, { page, sort: this.sort() });
      const prev = this.data();
      this.data.set(page > 1 && prev ? { ...r, items: [...prev.items, ...r.items] } : r);
      this.summary.emit({ average: r.average, count: r.count });
      // Arrivée depuis « Noter » dans Mon compte : on descend jusqu'aux avis.
      if (page === 1 && location.hash === '#avis') setTimeout(() => document.getElementById('avis')?.scrollIntoView({ block: 'start' }), 60);
    } catch { /* section simplement vide */ }
  }
  private async loadMine(slug: string) {
    try { this.mine.set(await this.api.get<MyReview>(`/account/reviews/${slug}`)); } catch { this.mine.set(null); }
  }
  setSort(s: 'recent' | 'best' | 'worst') { this.sort.set(s); this.load(this.slug()); }
  async more() { this.loadingMore.set(true); await this.load(this.slug(), (this.data()?.page ?? 1) + 1); this.loadingMore.set(false); }

  startEdit() {
    const r = this.mine()?.review;
    this.rating.set(r?.rating ?? 0); this.comment.set(r?.comment ?? '');
    this.photo.set(null); this.removePhoto.set(false); this.existingPhoto.set(r?.photoUrl ? r.photoUrl : null);
    this.error.set(''); this.editing.set(true);
  }
  cancel() { this.editing.set(false); this.error.set(''); }
  pick(ev: Event) {
    const input = ev.target as HTMLInputElement; const f = input.files?.[0]; input.value = '';
    if (!f) return;
    if (!PHOTO_TYPES.includes(f.type)) { this.error.set('Photo non prise en charge : JPEG, PNG ou WebP.'); return; }
    if (f.size > PHOTO_MAX) { this.error.set('Photo trop lourde : 5 Mo maximum.'); return; }
    this.error.set(''); this.photo.set(f); this.removePhoto.set(false);
  }
  clearPhoto() { this.photo.set(null); this.removePhoto.set(true); }

  async send() {
    this.error.set('');
    if (!this.rating()) { this.error.set('Choisissez une note de 1 à 5 étoiles.'); return; }
    if (this.comment().trim().length < 10) { this.error.set('Écrivez au moins 10 caractères.'); return; }
    const form = new FormData();
    form.append('productSlug', this.slug()); form.append('rating', String(this.rating())); form.append('comment', this.comment().trim());
    if (this.photo()) form.append('photo', this.photo()!);
    else if (this.removePhoto()) form.append('removePhoto', 'true');
    this.sending.set(true);
    try {
      await this.api.upload('/account/reviews', form);
      this.editing.set(false);
      this.toast.success('Merci ! Votre avis sera visible après validation par la boutique.');
      await Promise.all([this.loadMine(this.slug()), this.load(this.slug())]);
    } catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.sending.set(false);
  }

  async remove() {
    try {
      await this.api.delete(`/account/reviews/${this.slug()}`);
      this.toast.success('Votre avis a été supprimé.');
      await Promise.all([this.loadMine(this.slug()), this.load(this.slug())]);
    } catch (e) { this.toast.error(toApiError(e).message); }
  }
}
