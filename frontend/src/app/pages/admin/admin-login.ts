import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="login-page">
      <aside class="login-art" aria-hidden="true">
        <img src="img/hero-still.svg" alt="" />
        <div class="login-art-top"><span class="brand-mark">{{ cfg.shopName().charAt(0) }}</span><strong>{{ cfg.shopName() }}</strong></div>
        <p class="login-art-tag">Votre boutique,<br />bien tenue.</p>
      </aside>
      <div class="login-panel">
        <form class="login-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (cfg.logoUrl(); as logo) { <img class="login-logo" [src]="logo" [alt]="'Logo ' + cfg.shopName()" /> }
          <span class="eyebrow">Espace d'administration</span>
          <h1>Heureux de vous revoir</h1>
          <p class="muted">Connectez-vous pour suivre les commandes et gérer le catalogue de {{ cfg.shopName() }}.</p>
          @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
          <div class="field"><label for="e">Adresse e-mail</label><input id="e" class="input" type="email" formControlName="email" autocomplete="username" /></div>
          <div class="field"><label for="p">Mot de passe</label><input id="p" class="input" type="password" formControlName="password" autocomplete="current-password" /></div>
          <button class="btn block" type="submit" [disabled]="loading()">Se connecter</button>
          <a class="login-back" href="/">← Retour à la boutique</a>
        </form>
      </div>
    </div>`,
})
export class AdminLogin {
  private fb = inject(FormBuilder);
  private auth = inject(AuthService);
  private router = inject(Router);
  cfg = inject(ConfigService);
  error = signal(''); loading = signal(false);
  form = this.fb.nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  async submit() {
    if (this.form.invalid) { this.error.set('Saisissez votre e-mail et votre mot de passe.'); return; }
    this.loading.set(true); this.error.set('');
    try { const v = this.form.getRawValue(); await this.auth.login(v.email, v.password); await this.router.navigateByUrl(this.auth.homePath()); }
    catch (e) { this.error.set(toApiError(e).message); }
    this.loading.set(false);
  }
}
