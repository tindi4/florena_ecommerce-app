import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService, toApiError } from '../../core/api.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="container section narrow">
      <h1>Nous écrire</h1>
      @if (sent()) {
        <div class="notice ok" role="status">Message envoyé. Nous vous répondrons dès que possible.</div>
        <button class="btn ghost mt" (click)="sent.set(false)">Envoyer un autre message</button>
      } @else {
        <form class="card" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
          <div class="field"><label for="n">Votre nom</label><input id="n" class="input" formControlName="name" autocomplete="name" /></div>
          <div class="grid cols-2">
            <div class="field"><label for="p">Téléphone</label><input id="p" class="input" type="tel" formControlName="phone" autocomplete="tel" /></div>
            <div class="field"><label for="e">E-mail</label><input id="e" class="input" type="email" formControlName="email" autocomplete="email" /></div>
          </div>
          <p class="hint">Indiquez au moins un téléphone ou un e-mail pour que nous puissions vous répondre.</p>
          <div class="field"><label for="o">Numéro de commande (facultatif)</label><input id="o" class="input" formControlName="orderNumber" placeholder="CMD-XXXXXXXXXX" /></div>
          <div class="field"><label for="m">Votre message</label><textarea id="m" class="input" formControlName="message" maxlength="2000"></textarea></div>
          <button class="btn" type="submit" [disabled]="sending()">Envoyer le message</button>
        </form>
      }
    </div>`,
})
export class Contact {
  private fb = inject(FormBuilder);
  private api = inject(ApiService);
  sent = signal(false); sending = signal(false); error = signal('');
  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]], phone: [''], email: ['', Validators.email], orderNumber: [''],
    message: ['', [Validators.required, Validators.minLength(5)]],
  });
  async submit() {
    this.form.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Vérifiez les champs obligatoires.'); return; }
    this.sending.set(true); this.error.set('');
    try { await this.api.post('/messages', this.form.getRawValue()); this.sent.set(true); this.form.reset(); }
    catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.sending.set(false);
  }
}
