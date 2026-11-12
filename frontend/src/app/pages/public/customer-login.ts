import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { toApiError } from '../../core/api.service';
import { CustomerAuthService } from '../../core/customer-auth.service';
import { MyOrdersService } from '../../core/my-orders.service';

/** Connexion / création de compte client (téléphone ou nom d'utilisateur + mot de passe). */
@Component({
  selector: 'app-customer-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="container section narrow">
      <div class="tabs" role="tablist">
        <button class="tab" role="tab" [class.on]="mode() === 'login'" [attr.aria-selected]="mode() === 'login'" (click)="switch('login')">Se connecter</button>
        <button class="tab" role="tab" [class.on]="mode() === 'register'" [attr.aria-selected]="mode() === 'register'" (click)="switch('register')">Créer un compte</button>
      </div>

      @if (mode() === 'login') {
        <form class="card" [formGroup]="loginForm" (ngSubmit)="login()" novalidate>
          <h1>Mon compte</h1>
          @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
          <div class="field"><label for="li">Téléphone ou nom d'utilisateur</label>
            <input id="li" class="input" formControlName="identifier" autocomplete="username" autocapitalize="none" /></div>
          <div class="field"><label for="lp">Mot de passe</label>
            <input id="lp" class="input" type="password" formControlName="password" autocomplete="current-password" /></div>
          <button class="btn block" type="submit" [disabled]="busy()">Se connecter</button>
          <p class="hint mt-s">Vous avez commandé sans compte ? Créez-en un avec le même téléphone : vos commandes passées sur cet appareil y seront rattachées.</p>
        </form>
      } @else {
        <form class="card" [formGroup]="regForm" (ngSubmit)="register()" novalidate>
          <h1>Créer mon compte</h1>
          <p class="muted">Une minute suffit. Vos commandes seront réunies au même endroit, et votre nom et votre téléphone déjà remplis la prochaine fois.</p>
          @if (lastOrder; as o) { <p class="notice info">Votre commande <strong>{{ o.orderNumber }}</strong> sera ajoutée à votre compte dès sa création : vous la retrouverez dans « Mes commandes », sans code à retenir.</p> }
          @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
          <div class="field"><label for="rp">Téléphone</label>
            <input id="rp" class="input" type="tel" inputmode="tel" formControlName="phone" autocomplete="tel" />
            <span class="hint">@if (lastOrder) { C'est le numéro donné pour votre commande : gardez-le pour qu'elle soit rattachée à votre compte. } @else { Utilisez le numéro donné lors de vos commandes. }</span></div>
          <div class="field"><label for="ru">Nom d'utilisateur <span class="muted">(facultatif)</span></label>
            <input id="ru" class="input" formControlName="username" autocomplete="username" autocapitalize="none" />
            <span class="hint">3 à 30 caractères : lettres, chiffres, point, tiret. Permet de se connecter sans le téléphone.</span></div>
          <div class="field"><label for="rn">Nom <span class="muted">(facultatif)</span></label>
            <input id="rn" class="input" formControlName="name" autocomplete="name" /></div>
          <div class="field"><label for="rw">Mot de passe (8 caractères minimum)</label>
            <input id="rw" class="input" type="password" formControlName="password" autocomplete="new-password" /></div>
          <div class="field"><label for="rw2">Confirmer le mot de passe</label>
            <input id="rw2" class="input" type="password" formControlName="confirm" autocomplete="new-password" /></div>
          <button class="btn block" type="submit" [disabled]="busy()">Créer mon compte</button>
        </form>
      }
    </div>`,
})
export class CustomerLogin {
  private fb = inject(FormBuilder);
  private auth = inject(CustomerAuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  /** Dernière commande passée sur cet appareil : son téléphone est proposé d'office, pour qu'elle rejoigne le compte dès sa création. */
  lastOrder = inject(MyOrdersService).orders()[0] ?? null;
  /** « /connexion?mode=creer » ouvre directement l'onglet de création de compte. */
  mode = signal<'login' | 'register'>(this.route.snapshot.queryParamMap.get('mode') === 'creer' ? 'register' : 'login');
  error = signal(''); busy = signal(false);
  loginForm = this.fb.nonNullable.group({ identifier: ['', Validators.required], password: ['', Validators.required] });
  regForm = this.fb.nonNullable.group({
    phone: [this.lastOrder?.phone ?? '', [Validators.required, Validators.pattern(/^[+0-9 ().-]{6,25}$/)]],
    username: [''], name: [''],
    password: ['', [Validators.required, Validators.minLength(8)]], confirm: ['', Validators.required],
  });

  switch(m: 'login' | 'register') { this.mode.set(m); this.error.set(''); }

  async login() {
    if (this.loginForm.invalid) { this.error.set('Saisissez votre téléphone (ou nom d\'utilisateur) et votre mot de passe.'); return; }
    await this.run(() => { const v = this.loginForm.getRawValue(); return this.auth.login(v.identifier.trim(), v.password); });
  }
  async register() {
    const v = this.regForm.getRawValue();
    if (this.regForm.controls.phone.invalid) { this.error.set('Numéro de téléphone invalide.'); return; }
    if (this.regForm.controls.password.invalid) { this.error.set('Mot de passe : 8 caractères minimum.'); return; }
    if (v.password !== v.confirm) { this.error.set('Les deux mots de passe ne correspondent pas.'); return; }
    await this.run(() => this.auth.register({ phone: v.phone, username: v.username.trim() || undefined, name: v.name.trim() || undefined, password: v.password }));
  }
  private async run(fn: () => Promise<void>) {
    this.busy.set(true); this.error.set('');
    try {
      await fn();
      const back = this.route.snapshot.queryParamMap.get('retour');
      // On n'accepte qu'un chemin interne (« /… » mais pas « //site-pirate.com »).
      await this.router.navigateByUrl(back && back.startsWith('/') && !back.startsWith('//') ? back : '/mon-compte');
    } catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.busy.set(false);
  }
}
