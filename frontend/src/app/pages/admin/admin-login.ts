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
      <form class="card login-card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <h1>Administration</h1>
        <p class="muted">{{ cfg.shopName() }}</p>
        @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
        <div class="field"><label for="e">Adresse e-mail</label><input id="e" class="input" type="email" formControlName="email" autocomplete="username" /></div>
        <div class="field"><label for="p">Mot de passe</label><input id="p" class="input" type="password" formControlName="password" autocomplete="current-password" /></div>
        <button class="btn block" type="submit" [disabled]="loading()">Se connecter</button>
      </form>
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
    try { const v = this.form.getRawValue(); await this.auth.login(v.email, v.password); await this.router.navigate(['/admin/dashboard']); }
    catch (e) { this.error.set(toApiError(e).message); }
    this.loading.set(false);
  }
}
