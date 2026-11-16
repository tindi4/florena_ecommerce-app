import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { ToastService } from '../../core/toast.service';

/** Arrivée depuis le lien reçu par e-mail (/reinitialiser#jeton) : choix du nouveau mot de passe, puis connexion directe. */
@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="container section auth">
      <span class="eyebrow">Espace client</span>
      <h1>Nouveau mot de passe</h1>
      @if (!token) {
        <div class="notice error" role="alert">Ce lien est incomplet ou n'est plus valable.</div>
        <a class="btn" routerLink="/mot-de-passe-oublie">Demander un nouveau lien</a>
      } @else {
        <p class="muted">Choisissez un nouveau mot de passe. Vos autres appareils seront déconnectés.</p>
        <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error()) { <div class="notice error" role="alert">{{ error() }} <a routerLink="/mot-de-passe-oublie">Demander un nouveau lien</a></div> }
          <div class="field"><label for="np">Nouveau mot de passe (8 caractères minimum)</label>
            <input id="np" class="input" type="password" formControlName="password" autocomplete="new-password" /></div>
          <div class="field"><label for="np2">Confirmer le mot de passe</label>
            <input id="np2" class="input" type="password" formControlName="confirm" autocomplete="new-password" /></div>
          <button class="btn block" type="submit" [disabled]="busy()">{{ busy() ? 'Enregistrement…' : 'Enregistrer et me connecter' }}</button>
        </form>
      }
    </div>`,
})
export class ResetPassword {
  private api = inject(ApiService);
  private auth = inject(CustomerAuthService);
  private router = inject(Router);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);
  /** Le jeton est lu après « # » : il n'est jamais envoyé dans une adresse, seulement dans le corps de la requête. */
  token = /^[a-f0-9]{64}$/.test(inject(ActivatedRoute).snapshot.fragment || '') ? inject(ActivatedRoute).snapshot.fragment! : '';
  form = this.fb.nonNullable.group({ password: ['', [Validators.required, Validators.minLength(8)]], confirm: [''] });
  busy = signal(false); error = signal('');

  async submit() {
    this.error.set('');
    const v = this.form.getRawValue();
    if (this.form.controls.password.invalid) { this.error.set('Mot de passe : 8 caractères minimum.'); return; }
    if (v.password !== v.confirm) { this.error.set('Les deux mots de passe ne correspondent pas.'); return; }
    this.busy.set(true);
    try {
      this.auth.start(await this.api.post<any>('/customer/password/reset', { token: this.token, newPassword: v.password }));
      this.toast.success('Mot de passe modifié. Vous êtes connecté.');
      await this.router.navigateByUrl('/mon-compte');
    } catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.busy.set(false);
  }
}
