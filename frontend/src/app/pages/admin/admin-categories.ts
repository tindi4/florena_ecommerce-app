import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService, toApiError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { AdminCategory } from '../../core/models';
import { ConfirmDialog } from '../../shared/confirm-dialog';

@Component({
  selector: 'app-admin-categories',
  standalone: true,
  imports: [ReactiveFormsModule, ConfirmDialog],
  template: `
    <h1>Catégories</h1>
    <form class="card" [formGroup]="form" (ngSubmit)="save()" novalidate>
      <h2>{{ editId() ? 'Modifier la catégorie' : 'Nouvelle catégorie' }}</h2>
      <div class="grid cols-2">
        <div class="field"><label for="n">Nom</label><input id="n" class="input" formControlName="name" /></div>
        <div class="field"><label for="d">Description (facultatif)</label><input id="d" class="input" formControlName="description" /></div>
      </div>
      <div class="row gap wrap"><button class="btn" type="submit" [disabled]="saving()">{{ editId() ? 'Enregistrer' : 'Ajouter' }}</button>@if (editId()) { <button class="btn ghost" type="button" (click)="reset()">Annuler</button> }</div>
    </form>
    @if (loading()) { <div class="spinner"></div> }
    @else if (!items().length) { <div class="empty card mt"><h3>Aucune catégorie</h3><p>Créez-en une pour organiser vos produits.</p></div> }
    @else {
      <div class="card mt"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nom</th><th class="num">Produits</th><th>État</th><th></th></tr></thead>
        <tbody>@for (c of items(); track c.id) {
          <tr [class.off]="!c.isActive"><td><strong>{{ c.name }}</strong><div class="muted small">{{ c.description }}</div></td><td class="num">{{ c.productCount }}</td>
            <td><span class="badge" [class.pay-yes]="c.isActive">{{ c.isActive ? 'Active' : 'Désactivée' }}</span></td>
            <td class="num"><button class="btn sm ghost" (click)="edit(c)">Modifier</button>
              <button class="btn sm" [class.danger-ghost]="c.isActive" [class.ghost]="!c.isActive" (click)="c.isActive ? ask.set(c) : toggle(c, true)">{{ c.isActive ? 'Désactiver' : 'Réactiver' }}</button></td></tr>
        }</tbody></table></div></div>
    }
    @if (ask(); as c) { <app-confirm title="Désactiver cette catégorie ?" [message]="c.productCount > 0 ? 'Elle contient ' + c.productCount + ' produit(s) : ils ne seront plus visibles en boutique tant que la catégorie est désactivée. Aucune donnée n’est supprimée.' : 'Elle ne sera plus proposée dans la boutique.'" confirmLabel="Désactiver" [danger]="true" (confirm)="toggle(c, false); ask.set(null)" (cancel)="ask.set(null)" /> }`,
})
export class AdminCategories implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  items = signal<AdminCategory[]>([]);
  loading = signal(true); saving = signal(false);
  editId = signal<number | null>(null);
  ask = signal<AdminCategory | null>(null);
  form = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.minLength(2)]], description: [''], isActive: [true] });
  ngOnInit() { this.load(); }
  async load() { try { this.items.set((await this.api.get<{ items: AdminCategory[] }>('/admin/categories')).items); } catch { /* ignore */ } this.loading.set(false); }
  edit(c: AdminCategory) { this.editId.set(c.id); this.form.patchValue({ name: c.name, description: c.description ?? '', isActive: c.isActive }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  reset() { this.editId.set(null); this.form.reset({ name: '', description: '', isActive: true }); }
  async save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); this.toast.error('Indiquez le nom de la catégorie.'); return; }
    this.saving.set(true);
    try {
      const id = this.editId();
      if (id) await this.api.put(`/admin/categories/${id}`, this.form.getRawValue()); else await this.api.post('/admin/categories', this.form.getRawValue());
      this.toast.success('Catégorie enregistrée.'); this.reset(); await this.load();
    } catch (e) { this.toast.error(toApiError(e).message); }
    this.saving.set(false);
  }
  async toggle(c: AdminCategory, isActive: boolean) {
    try { await this.api.patch(`/admin/categories/${c.id}/active`, { isActive }); this.load(); } catch (e) { this.toast.error(toApiError(e).message); }
  }
}
