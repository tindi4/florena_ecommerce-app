import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { AccountOrder, OrderStatus, STATUS_LABELS } from '../../core/models';
import { MyOrdersService } from '../../core/my-orders.service';
import { Theme, ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { saveBlob } from '../../core/utils';
import { ImgPipe, MoneyPipe } from '../../shared/pipes';
import { PayBadge, StatusBadge } from '../../shared/status-badge';

interface ClaimResult { claimed: string[]; alreadyMine: string[]; refused: string[]; }
interface News { orderNumber: string; trackingCode: string; text: string; }

const AVATAR_KEY = 'boutique.avatar.v1';   // photo de profil, gardée sur l'appareil uniquement
const SEEN_KEY = 'boutique.seen.v1';       // dernier statut vu de chaque commande (pour la cloche)
const ALERT_KEY = 'boutique.alerts.v1';    // alertes du navigateur activées sur cet appareil
/** Étapes d'une commande, dans l'ordre (une commande annulée n'affiche pas de progression). */
const STEPS: OrderStatus[] = ['EN_ATTENTE', 'CONFIRMEE', 'EN_PREPARATION', 'TERMINEE'];
const read = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
const write = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* stockage indisponible */ } };

/** « Mon compte » : mes commandes (illustrées, cliquables), nouveautés, photo de profil ; les réglages sont dans leur propre onglet. */
@Component({
  selector: 'app-account',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DatePipe, MoneyPipe, ImgPipe, StatusBadge, PayBadge],
  template: `
    <div class="container section narrow acct">
      <header class="acct-head">
        <label class="acct-avatar" title="Changer ma photo">
          @if (avatar(); as a) { <img [src]="a" alt="Ma photo" /> } @else { <span aria-hidden="true">{{ initial() }}</span> }
          <span class="acct-avatar-edit" aria-hidden="true"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span>
          <input class="sr-only" type="file" accept="image/*" (change)="pickAvatar($event)" aria-label="Changer ma photo de profil" />
        </label>
        <div class="acct-id">
          <span class="eyebrow">Mon compte</span>
          <h1>Bonjour {{ me()?.name || me()?.username || '' }}</h1>
          <p class="muted">{{ me()?.phone }}</p>
        </div>
        <div class="acct-bell-wrap">
          <button type="button" class="acct-bell" (click)="toggleBell()" [attr.aria-expanded]="bellOpen()" [attr.aria-label]="news().length + ' nouveauté(s) sur vos commandes'">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>
            @if (news().length) { <span class="cart-count">{{ news().length }}</span> }
          </button>
          @if (bellOpen()) {
            <div class="acct-pop" role="dialog" aria-label="Nouveautés">
              <strong>Nouveautés</strong>
              @if (!shown().length) { <p class="muted small">Rien de nouveau pour l'instant. Dès qu'une commande change de statut, vous le verrez ici.</p> }
              @for (n of shown(); track n.orderNumber) {
                <a routerLink="/suivi" [fragment]="n.trackingCode" class="acct-news"><span class="dot-unread"></span><span>{{ n.text }}</span></a>
              }
            </div>
          }
        </div>
      </header>

      <div class="tabs" role="tablist">
        <button role="tab" class="tab" [class.on]="view() === 'orders'" [attr.aria-selected]="view() === 'orders'" (click)="view.set('orders')">Mes commandes</button>
        <button role="tab" class="tab" [class.on]="view() === 'settings'" [attr.aria-selected]="view() === 'settings'" (click)="view.set('settings')">Réglages</button>
      </div>

      @if (view() === 'orders') {
        <div class="acct-stats">
          <div><strong>{{ active() }}</strong><span>en cours</span></div>
          <div><strong>{{ done() }}</strong><span>terminée{{ done() > 1 ? 's' : '' }}</span></div>
          <div><strong>{{ orders().length }}</strong><span>commande{{ orders().length > 1 ? 's' : '' }} au total</span></div>
        </div>

        @if (loading()) { <div class="spinner"></div> }
        @else if (!orders().length) {
          <div class="empty">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h14l-1 12H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>
            <h3>Aucune commande pour l'instant</h3><p>Vos commandes s'afficheront ici, avec leur suivi.</p>
            <a class="btn" routerLink="/catalogue">Découvrir la collection</a>
          </div>
        } @else {
          <div class="acct-orders">
            @for (o of orders(); track o.orderNumber) {
              <article class="acct-order">
                <a class="acct-order-link" routerLink="/suivi" [fragment]="o.trackingCode" [attr.aria-label]="'Voir le détail de la commande ' + o.orderNumber">
                  <div class="acct-thumbs">
                    @for (it of (o.items ?? []).slice(0, 3); track $index) {
                      <span class="acct-thumb">@if (it.imageUrl) { <img [src]="it.imageUrl | img" [alt]="it.name" loading="lazy" /> } @else { <span class="ph" aria-hidden="true">{{ it.name.charAt(0) }}</span> }</span>
                    }
                    @if ((o.items ?? []).length > 3) { <span class="acct-thumb more">+{{ (o.items ?? []).length - 3 }}</span> }
                  </div>
                  <div class="acct-order-main">
                    <div class="acct-order-top"><strong>{{ o.orderNumber }}</strong><app-status-badge [status]="o.status" /><app-pay-badge [paid]="o.paymentStatus" /></div>
                    <p class="acct-order-items">{{ names(o) }}</p>
                    @if (o.status !== 'ANNULEE') {
                      <div class="acct-steps" [attr.aria-label]="'Étape ' + step(o) + ' sur 4'">@for (s of [1, 2, 3, 4]; track s) { <span [class.on]="s <= step(o)"></span> }</div>
                    }
                    <div class="acct-order-foot"><span class="muted small">{{ o.createdAt | date:'d MMM yyyy' }} · {{ o.itemCount }} article{{ o.itemCount > 1 ? 's' : '' }}</span><strong>{{ o.total | money:o.currency }}</strong></div>
                  </div>
                  <svg class="acct-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
                </a>
                <button type="button" class="link-btn small" (click)="invoice(o)">Télécharger la facture (PDF)</button>
              </article>
            }
          </div>
        }

        <div class="acct-extra">
          <a class="quick-card" routerLink="/catalogue">
            <span class="kpi-ico t-teal" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 8h14l-1 12H6L5 8ZM9 8V6a3 3 0 0 1 6 0v2" /></svg></span>
            <span><strong>Continuer mes achats</strong><small>Voir les nouveautés de la boutique</small></span>
          </a>
          @if (wa(); as link) {
            <a class="quick-card" [href]="link" target="_blank" rel="noopener">
              <span class="kpi-ico t-green" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.5A8 8 0 1 1 21 12Z" /></svg></span>
              <span><strong>Une question ?</strong><small>Écrivez-nous sur WhatsApp</small></span>
            </a>
          } @else {
            <a class="quick-card" routerLink="/contact">
              <span class="kpi-ico t-green" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 0 1-11.8 7L3 21l2-5.5A8 8 0 1 1 21 12Z" /></svg></span>
              <span><strong>Une question ?</strong><small>Écrivez à la boutique</small></span>
            </a>
          }
        </div>

        <details class="more acct-claim">
          <summary>Ajouter une commande passée sans compte</summary>
          <form class="claim" [formGroup]="claimForm" (ngSubmit)="claim()" novalidate>
            <span class="hint">Numéro (CMD-…) ou code complet. La commande doit avoir été passée avec le téléphone de ce compte.</span>
            <div class="row gap wrap"><input class="input" style="flex:1;min-width:220px" formControlName="ref" autocapitalize="characters" placeholder="CMD-XXXXXXXXXX" aria-label="Numéro ou code de la commande" />
              <button class="btn ghost" type="submit">Ajouter</button></div>
            @if (claimError()) { <div class="notice error mt-s" role="alert">{{ claimError() }}</div> }
          </form>
        </details>
      } @else {
        <section class="card">
          <h2>Ma photo</h2>
          <div class="row gap wrap">
            <label class="btn ghost sm">Choisir une photo<input class="sr-only" type="file" accept="image/*" (change)="pickAvatar($event)" /></label>
            @if (avatar()) { <button type="button" class="btn ghost sm" (click)="removeAvatar()">Retirer la photo</button> }
          </div>
          <p class="hint mt-s">La photo reste sur cet appareil : elle n'est pas envoyée à la boutique.</p>
        </section>

        <section class="card mt">
          <h2>Alertes</h2>
          <label class="check"><input type="checkbox" [checked]="alerts()" (change)="toggleAlerts()" /> M'alerter sur cet appareil quand une commande change de statut</label>
          <p class="hint mt-s">L'alerte s'affiche tant que la boutique est ouverte dans votre navigateur. La cloche en haut de page garde toujours la trace des nouveautés.</p>
        </section>

        <section class="card mt">
          <h2>Apparence</h2>
          <div class="row gap" role="radiogroup" aria-label="Thème">
            <button type="button" class="chip" [class.on]="theme.theme() === 'light'" [attr.aria-checked]="theme.theme() === 'light'" role="radio" (click)="setTheme('light')">☀️ Clair</button>
            <button type="button" class="chip" [class.on]="theme.theme() === 'dark'" [attr.aria-checked]="theme.theme() === 'dark'" role="radio" (click)="setTheme('dark')">🌙 Sombre</button>
          </div>
        </section>

        <form class="card mt" [formGroup]="profileForm" (ngSubmit)="saveProfile()" novalidate>
          <h2>Mon profil</h2>
          @if (profileError()) { <div class="notice error" role="alert">{{ profileError() }}</div> }
          <div class="field"><label for="pn">Nom affiché</label><input id="pn" class="input" formControlName="name" autocomplete="name" /></div>
          <div class="field"><label for="pu">Nom d'utilisateur</label><input id="pu" class="input" formControlName="username" autocapitalize="none" autocomplete="username" />
            <span class="hint">3 à 30 caractères (lettres, chiffres, point, tiret). Laissez vide pour vous connecter uniquement avec le téléphone.</span></div>
          <button class="btn" type="submit">Enregistrer</button>
        </form>

        <form class="card mt" [formGroup]="pwForm" (ngSubmit)="changePassword()" novalidate>
          <h2>Mot de passe</h2>
          @if (pwError()) { <div class="notice error" role="alert">{{ pwError() }}</div> }
          <div class="field"><label for="cp">Mot de passe actuel</label><input id="cp" class="input" type="password" formControlName="currentPassword" autocomplete="current-password" /></div>
          <div class="field"><label for="np">Nouveau mot de passe (8 caractères minimum)</label><input id="np" class="input" type="password" formControlName="newPassword" autocomplete="new-password" /></div>
          <div class="field"><label for="np2">Confirmer</label><input id="np2" class="input" type="password" formControlName="confirm" autocomplete="new-password" /></div>
          <button class="btn" type="submit">Changer le mot de passe</button>
          <p class="hint mt-s">Vos autres appareils seront déconnectés.</p>
        </form>

        <button class="btn ghost mt" type="button" (click)="logout()">Se déconnecter</button>
      }
    </div>`,
})
export class Account implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toast = inject(ToastService);
  private mine = inject(MyOrdersService);
  private cfg = inject(ConfigService);
  auth = inject(CustomerAuthService);
  theme = inject(ThemeService);
  me = this.auth.customer;
  wa = () => this.cfg.whatsappLink(`Bonjour ${this.cfg.shopName()}, j'ai une question sur ma commande.`);

  view = signal<'orders' | 'settings'>('orders');
  orders = signal<AccountOrder[]>([]); loading = signal(true);
  active = computed(() => this.orders().filter((o) => o.status !== 'TERMINEE' && o.status !== 'ANNULEE').length);
  done = computed(() => this.orders().filter((o) => o.status === 'TERMINEE').length);
  initial = computed(() => (this.me()?.name || this.me()?.username || this.me()?.phone || '?').trim().charAt(0).toUpperCase());

  avatar = signal<string | null>(read<string | null>(AVATAR_KEY, null));
  alerts = signal<boolean>(read<boolean>(ALERT_KEY, false) && typeof Notification !== 'undefined' && Notification.permission === 'granted');
  /** Changements de statut depuis la dernière ouverture de la cloche. */
  news = signal<News[]>([]);
  /** Ce que la cloche affiche une fois ouverte (les nouveautés sont alors marquées comme vues). */
  shown = signal<News[]>([]);
  bellOpen = signal(false);
  private timer?: ReturnType<typeof setInterval>;

  claimError = signal(''); profileError = signal(''); pwError = signal('');
  claimForm = this.fb.nonNullable.group({ ref: ['', Validators.required] });
  profileForm = this.fb.nonNullable.group({ username: [''], name: [''] });
  pwForm = this.fb.nonNullable.group({ currentPassword: ['', Validators.required], newPassword: ['', [Validators.required, Validators.minLength(8)]], confirm: [''] });

  async ngOnInit() {
    const c = this.me();
    this.profileForm.reset({ username: c?.username ?? '', name: c?.name ?? '' });
    await this.claimDeviceOrders();
    await this.load();
    // Tant que la page est ouverte, le statut des commandes est relu chaque minute (cloche et alertes).
    this.timer = setInterval(() => this.load(true), 60000);
  }
  ngOnDestroy() { clearInterval(this.timer); }

  step(o: AccountOrder) { return STEPS.indexOf(o.status) + 1; }
  names(o: AccountOrder) {
    const list = (o.items ?? []).map((i) => (i.quantity > 1 ? `${i.quantity} × ${i.name}` : i.name));
    return list.length ? list.join(', ') : `${o.itemCount} article${o.itemCount > 1 ? 's' : ''}`;
  }

  async load(silent = false) {
    try {
      const items = (await this.api.get<{ items: AccountOrder[] }>('/account/orders')).items;
      this.orders.set(items); this.detectNews(items, silent);
    } catch (e) { if (!silent) this.toast.error(toApiError(e).message); }
    this.loading.set(false);
  }

  /** Compare le statut de chaque commande au dernier statut vu sur cet appareil. */
  private detectNews(items: AccountOrder[], notify: boolean) {
    const seen = read<Record<string, string>>(SEEN_KEY, {});
    const fresh: News[] = [];
    for (const o of items) {
      if (seen[o.orderNumber] === undefined) { seen[o.orderNumber] = o.status; continue; }   // première fois : rien à signaler
      if (seen[o.orderNumber] !== o.status) fresh.push({ orderNumber: o.orderNumber, trackingCode: o.trackingCode, text: `${o.orderNumber} : ${STATUS_LABELS[o.status].toLowerCase()}` });
    }
    write(SEEN_KEY, seen);
    const before = new Set(this.news().map((n) => n.orderNumber + n.text));
    if (notify && this.alerts()) for (const n of fresh) if (!before.has(n.orderNumber + n.text)) this.alert(n);
    this.news.set(fresh);
  }
  private alert(n: News) {
    try { new Notification(this.cfg.shopName(), { body: `Votre commande ${n.text}.` }); } catch { /* alertes non disponibles */ }
  }
  toggleBell() {
    const open = !this.bellOpen();
    this.bellOpen.set(open);
    if (!open) return;
    // À l'ouverture : on affiche les nouveautés, puis on les considère comme vues.
    this.shown.set(this.news());
    const seen = read<Record<string, string>>(SEEN_KEY, {});
    for (const o of this.orders()) seen[o.orderNumber] = o.status;
    write(SEEN_KEY, seen); this.news.set([]);
  }
  async toggleAlerts() {
    if (this.alerts()) { this.alerts.set(false); write(ALERT_KEY, false); return; }
    if (typeof Notification === 'undefined') { this.toast.error('Ce navigateur ne propose pas les alertes.'); return; }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') { this.toast.error('Les alertes sont bloquées dans votre navigateur.'); return; }
    this.alerts.set(true); write(ALERT_KEY, true); this.toast.success('Alertes activées sur cet appareil.');
  }

  /** Photo de profil : réduite à 256 px et gardée sur l'appareil (rien n'est envoyé au serveur). */
  pickAvatar(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { this.toast.error('Choisissez une image.'); return; }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256, side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
      canvas.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      const data = canvas.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(url);
      this.avatar.set(data); write(AVATAR_KEY, data); this.toast.success('Photo mise à jour.');
    };
    img.onerror = () => { URL.revokeObjectURL(url); this.toast.error('Image illisible : essayez-en une autre.'); };
    img.src = url;
  }
  removeAvatar() { this.avatar.set(null); try { localStorage.removeItem(AVATAR_KEY); } catch { /* ignore */ } }

  /** Les commandes passées en invité sur cet appareil sont rattachées automatiquement (si même téléphone). */
  private async claimDeviceOrders() {
    const refs = this.mine.orders().map((o) => o.trackingCode || o.orderNumber).slice(0, 30);
    if (!refs.length) return;
    try {
      const r = await this.api.post<ClaimResult>('/account/orders/claim', { orders: refs });
      if (r.claimed.length) this.toast.success(`${r.claimed.length} commande(s) de cet appareil ajoutée(s) à votre compte.`);
    } catch { /* facultatif */ }
  }

  async claim() {
    this.claimError.set('');
    const ref = this.claimForm.getRawValue().ref.trim().toUpperCase();
    if (!ref) { this.claimError.set('Saisissez un numéro de commande ou un code complet.'); return; }
    try {
      const r = await this.api.post<ClaimResult>('/account/orders/claim', { orders: [ref] });
      if (r.claimed.length) { this.toast.success('Commande ajoutée à votre compte.'); this.claimForm.reset(); await this.load(); }
      else if (r.alreadyMine.length) this.claimError.set('Cette commande est déjà dans votre compte.');
      else this.claimError.set('Commande introuvable, déjà rattachée à un autre compte, ou passée avec un autre téléphone.');
    } catch (e) { const err = toApiError(e); this.claimError.set(err.details?.[0]?.message ?? err.message); }
  }

  async setTheme(t: Theme) {
    this.theme.set(t);
    try { await this.api.patch('/account/preferences', { theme: t }); } catch (e) { this.toast.error(toApiError(e).message); }
  }

  async saveProfile() {
    this.profileError.set('');
    const v = this.profileForm.getRawValue();
    try {
      const r = await this.api.patch<{ customer: any }>('/account/profile', { username: v.username.trim(), name: v.name.trim() });
      this.auth.customer.set(r.customer); this.toast.success('Profil enregistré.');
    } catch (e) { const err = toApiError(e); this.profileError.set(err.details?.[0]?.message ?? err.message); }
  }

  async changePassword() {
    this.pwError.set('');
    const v = this.pwForm.getRawValue();
    if (this.pwForm.invalid) { this.pwError.set('Saisissez le mot de passe actuel et un nouveau mot de passe de 8 caractères minimum.'); return; }
    if (v.newPassword !== v.confirm) { this.pwError.set('Les deux nouveaux mots de passe ne correspondent pas.'); return; }
    try {
      this.auth.start(await this.api.post<any>('/account/password', { currentPassword: v.currentPassword, newPassword: v.newPassword }));
      this.pwForm.reset(); this.toast.success('Mot de passe modifié.');
    } catch (e) { const err = toApiError(e); this.pwError.set(err.details?.[0]?.message ?? err.message); }
  }

  async invoice(o: AccountOrder) {
    try { saveBlob(await this.api.getBlob(`/account/orders/${o.orderNumber}/invoice`), `${o.orderNumber}.pdf`); }
    catch { this.toast.error('Impossible de générer la facture pour le moment.'); }
  }

  async logout() { await this.auth.logout(); await this.router.navigate(['/']); }
}
