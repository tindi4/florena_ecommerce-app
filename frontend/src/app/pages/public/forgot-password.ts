import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';

/** Mot de passe oublié : le client indique l'e-mail de son compte et reçoit un lien pour en choisir un nouveau. */
@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="container section auth">
      <span class="eyebrow">Espace client</span>
      <h1>Mot de passe oublié</h1>
      @if (sent()) {
        <div class="notice ok" role="status">Si un compte utilise cette adresse, un e-mail vient de partir avec un lien pour choisir un nouveau mot de passe. Il est valable une heure.</div>
        <p class="muted">Rien reçu au bout de quelques minutes ? Regardez dans vos courriers indésirables, ou vérifiez l'adresse saisie.</p>
        <a class="btn ghost" routerLink="/connexion">Retour à la connexion</a>
      } @else {
        <p class="muted">Indiquez l'adresse e-mail de votre compte : nous vous envoyons un lien pour choisir un nouveau mot de passe.</p>
        <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
          <div class="field"><label for="fe">Adresse e-mail</label>
            <input id="fe" class="input" type="email" formControlName="email" autocomplete="email" inputmode="email" /></div>
          <button class="btn block" type="submit" [disabled]="busy()">{{ busy() ? 'Envoi…' : 'Recevoir le lien' }}</button>
        </form>
        <p class="auth-alt">Pas d'adresse e-mail sur votre compte ? <a routerLink="/contact">Écrivez à la boutique</a>, nous vous aiderons à le retrouver.</p>
        <a class="arrow-link" routerLink="/connexion">Retour à la connexion</a>
      }
    </div>`,
})
export class ForgotPassword {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  sent = signal(false); busy = signal(false); error = signal('');

  async submit() {
    this.error.set('');
    if (this.form.invalid) { this.error.set('Saisissez une adresse e-mail valide.'); return; }
    this.busy.set(true);
    try { await this.api.post('/customer/password/forgot', { email: this.form.getRawValue().email.trim() }); this.sent.set(true); }
    catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.busy.set(false);
  }
}
