import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService, toApiError } from '../../core/api.service';
import { ConfigService, ShopBranding, textColorOn } from '../../core/config.service';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';

const ALLOWED = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
const MAX = 2 * 1024 * 1024;

/** Réglages de la boutique : nom, couleur principale et logo (réservé à l'administrateur). */
@Component({
  selector: 'app-admin-settings',
  standalone: true,
  imports: [ReactiveFormsModule, ConfirmDialog],
  template: `
    <h1>Réglages</h1>
    <p class="muted">Le nom, la couleur et le logo s'appliquent au site, à l'administration, à la page de connexion et aux factures PDF.</p>

    <form class="card" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <h2>Identité de la boutique</h2>
      @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
      <div class="field"><label for="sn">Nom de la boutique</label>
        <input id="sn" class="input" formControlName="shopName" maxlength="80" /></div>
      <div class="field"><label for="pc">Couleur principale</label>
        <div class="row gap wrap">
          <input id="pc" type="color" class="color-input" formControlName="primaryColor" aria-describedby="pch" />
          <input class="input" style="max-width:9rem" formControlName="primaryColor" aria-label="Code couleur" maxlength="7" />
          <span class="color-preview" [style.background]="form.controls.primaryColor.value" [style.color]="ink()">Aperçu du bouton</span>
        </div>
        <span id="pch" class="hint">Format #RRGGBB. Le texte des boutons passe automatiquement en blanc ou en noir pour rester lisible.</span>
      </div>
      <button class="btn" type="submit" [disabled]="saving()">Enregistrer</button>
    </form>

    <section class="card mt">
      <h2>Logo</h2>
      <div class="logo-zone">
        @if (cfg.logoUrl(); as logo) { <img class="logo-preview" [src]="logo" alt="Logo actuel" /> }
        @else { <div class="logo-preview empty">Aucun logo</div> }
        <div class="stack">
          <label class="btn ghost" for="lf">{{ cfg.logoUrl() ? 'Remplacer le logo' : 'Choisir un logo' }}</label>
          <input id="lf" class="sr-only" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml" (change)="upload($event)" [disabled]="uploading()" />
          @if (cfg.logoUrl()) { <button type="button" class="btn danger-ghost sm" (click)="askRemove.set(true)">Retirer le logo</button> }
        </div>
      </div>
      @if (uploading()) { <p class="hint">Envoi en cours…</p> }
      @if (logoError()) { <div class="notice error mt-s" role="alert">{{ logoError() }}</div> }
      <p class="hint mt-s">PNG, JPG, WebP ou SVG, 2 Mo maximum. Le serveur vérifie le contenu réel du fichier.
        Sur la facture PDF, seuls les logos <strong>PNG ou JPG</strong> peuvent être imprimés (sinon le nom de la boutique est affiché).</p>
    </section>

    @if (askRemove()) { <app-confirm title="Retirer le logo ?" message="La première lettre du nom de la boutique sera affichée à la place." confirmLabel="Retirer" [danger]="true" (confirm)="removeLogo()" (cancel)="askRemove.set(false)" /> }`,
})
export class AdminSettings implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  cfg = inject(ConfigService);
  saving = signal(false); uploading = signal(false); askRemove = signal(false);
  error = signal(''); logoError = signal('');
  form = this.fb.nonNullable.group({
    shopName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    primaryColor: ['#0d4f4c', [Validators.required, Validators.pattern(/^#[0-9a-fA-F]{6}$/)]],
  });
  ink = () => (/^#[0-9a-f]{6}$/i.test(this.form.controls.primaryColor.value) ? textColorOn(this.form.controls.primaryColor.value) : '#fff');

  async ngOnInit() {
    try { const s = await this.api.get<ShopBranding>('/admin/settings'); this.form.reset({ shopName: s.shopName, primaryColor: s.primaryColor }); }
    catch (e) { this.error.set(toApiError(e).message); }
  }

  async save() {
    this.error.set('');
    if (this.form.invalid) {
      this.error.set(this.form.controls.shopName.invalid ? 'Le nom doit contenir entre 2 et 80 caractères.' : 'Couleur invalide : utilisez le format #RRGGBB.');
      return;
    }
    this.saving.set(true);
    try {
      this.cfg.applyBranding(await this.api.put<ShopBranding>('/admin/settings', this.form.getRawValue()));
      this.toast.success('Réglages enregistrés.');
    } catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.saving.set(false);
  }

  async upload(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.logoError.set('');
    if (!file) return;
    // Contrôle rapide dans le navigateur (confort) : le vrai contrôle est fait par le serveur.
    if (file.type && !ALLOWED.includes(file.type)) { this.logoError.set('Format non pris en charge : PNG, JPG, WebP ou SVG.'); return; }
    if (file.size > MAX) { this.logoError.set('Logo trop lourd : 2 Mo maximum.'); return; }
    const form = new FormData(); form.append('logo', file);
    this.uploading.set(true);
    try { this.cfg.applyBranding(await this.api.upload<ShopBranding>('/admin/settings/logo', form)); this.toast.success('Logo mis à jour.'); }
    catch (e) { this.logoError.set(toApiError(e).message); }
    this.uploading.set(false);
  }

  async removeLogo() {
    this.askRemove.set(false);
    try { this.cfg.applyBranding(await this.api.delete<ShopBranding>('/admin/settings/logo')); this.toast.success('Logo retiré.'); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }
}
