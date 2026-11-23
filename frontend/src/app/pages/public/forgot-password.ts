import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';

/**
 * Mot de passe oublié : le client indique son téléphone ou son nom d'utilisateur.
 * La boutique lui écrit sur WhatsApp (numéro du compte) pour vérifier que la demande vient de lui,
 * puis lui envoie le lien quand il répond.
 * La réponse est la même que le compte existe ou non.
 */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="container section auth">
      <span class="eyebrow">Espace client</span>
      <h1>Mot de passe oublié</h1>
      @if (sent()) {
        <div class="notice ok" role="status">Demande envoyée. La boutique va vous écrire sur WhatsApp pour vérifier que la demande vient bien de vous.</div>
        <ul class="reset-steps">
          <li><strong>La boutique vous écrit sur WhatsApp</strong><span>Sur le numéro de votre compte, pour vous demander si la demande vient bien de vous.</span></li>
          <li><strong>Répondez « Oui »</strong><span>La boutique vous envoie alors un lien personnel.</span></li>
          <li><strong>Choisissez votre nouveau mot de passe</strong><span>Vos autres appareils seront déconnectés.</span></li>
        </ul>
        <a class="btn ghost" routerLink="/connexion">Retour à la connexion</a>
      } @else {
        <p class="muted">Indiquez le téléphone ou le nom d’utilisateur de votre compte. La boutique vous écrira sur WhatsApp, au numéro enregistré sur votre compte.</p>
        <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
          <div class="field"><label for="fi">Téléphone ou nom d’utilisateur</label>
            <input id="fi" class="input" formControlName="identifier" autocomplete="username" maxlength="60" placeholder="Ex. 90 12 34 56" /></div>
          <button class="btn block" type="submit" [disabled]="busy()">{{ busy() ? 'Envoi…' : 'Faire une demande de réinitialisation' }}</button>
        </form>
        <p class="auth-alt">Un souci ? <a routerLink="/contact">Écrivez à la boutique</a>.</p>
        <a class="arrow-link" routerLink="/connexion">Retour à la connexion</a>
      }
    </div>`,
})
export class ForgotPassword {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  form = this.fb.nonNullable.group({ identifier: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(60)]] });
  sent = signal(false); busy = signal(false); error = signal('');

  async submit() {
    this.error.set('');
    if (this.form.invalid) { this.error.set('Saisissez votre téléphone ou votre nom d’utilisateur.'); return; }
    this.busy.set(true);
    try { await this.api.post('/customer/password/forgot', { identifier: this.form.getRawValue().identifier.trim() }); this.sent.set(true); }
    catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.busy.set(false);
  }
}
