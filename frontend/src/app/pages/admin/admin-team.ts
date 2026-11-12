import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ApiService, toApiError } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Permission, PermissionDef, StaffRoleDef, StaffUser } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { ConfirmDialog } from '../../shared/confirm-dialog';

interface TeamResponse { items: StaffUser[]; roles: StaffRoleDef[]; permissions: PermissionDef[]; }

/**
 * Équipe : comptes secondaires + rôles personnalisables (permissions cochées une par une).
 * Les cases des droits que VOUS n'avez pas sont grisées : le serveur refuse de toute façon de les accorder.
 */
@Component({
  selector: 'app-admin-team',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, ConfirmDialog],
  template: `
    <h1>Équipe</h1>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" [class.on]="tab() === 'users'" [attr.aria-selected]="tab() === 'users'" (click)="tab.set('users')">Comptes</button>
      <button class="tab" role="tab" [class.on]="tab() === 'roles'" [attr.aria-selected]="tab() === 'roles'" (click)="tab.set('roles')">Rôles et permissions</button>
    </div>

    @if (loading()) { <div class="spinner"></div> }
    @else if (tab() === 'users') {
      <form class="card" [formGroup]="form" (ngSubmit)="create()" novalidate>
        <h2>Nouveau compte</h2>
        @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
        <div class="grid cols-2">
          <div class="field"><label for="n">Nom</label><input id="n" class="input" formControlName="name" /></div>
          <div class="field"><label for="e">E-mail (identifiant de connexion)</label><input id="e" class="input" type="email" formControlName="email" autocomplete="off" /></div>
          <div class="field"><label for="p">Mot de passe (12 caractères minimum)</label><input id="p" class="input" type="password" formControlName="password" autocomplete="new-password" /></div>
          <div class="field"><label for="r">Rôle</label>
            <select id="r" class="input" formControlName="roleId">
              @for (r of assignable(); track r.id) { <option [ngValue]="r.id" [disabled]="!canGrant(r.permissions)">{{ r.name }}</option> }
            </select></div>
        </div>
        @if (selectedRole(); as r) { <p class="hint">Ce rôle donne accès à : {{ permsText(r.permissions) }}.</p> }
        <button class="btn" type="submit" [disabled]="saving()">Créer le compte</button>
      </form>

      <div class="card mt"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Compte</th><th>Rôle</th><th>État</th><th></th></tr></thead>
        <tbody>@for (u of users(); track u.id) {
          <tr [class.off]="!u.isActive">
            <td><strong>{{ u.name }}</strong><div class="muted small">{{ u.email }}</div><div class="muted small">Créé le {{ u.createdAt | date:'dd/MM/yyyy' }}@if (u.createdBy) { par {{ u.createdBy }} }</div></td>
            <td>@if (u.isMain || u.id === me()?.id || !canGrant(u.permissions)) { <span class="badge st-CONFIRMEE">{{ u.roleName }}</span> }
              @else { <select class="input" style="min-width:220px" [attr.aria-label]="'Rôle de ' + u.name" (change)="changeRole(u, +$any($event.target).value)">
                @for (r of assignable(); track r.id) { <option [value]="r.id" [selected]="r.id === u.roleId" [disabled]="!canGrant(r.permissions)">{{ r.name }}</option> }</select> }</td>
            <td><span class="badge" [class.pay-yes]="u.isActive">{{ u.isActive ? 'Actif' : 'Désactivé' }}</span></td>
            <td class="num">@if (!u.isMain && u.id !== me()?.id && canGrant(u.permissions)) {
              <button class="btn sm ghost" (click)="resetFor.set(u)">Mot de passe</button>
              <button class="btn sm" [class.danger-ghost]="u.isActive" [class.ghost]="!u.isActive" (click)="u.isActive ? askOff.set(u) : toggle(u, true)">{{ u.isActive ? 'Désactiver' : 'Réactiver' }}</button> }</td>
          </tr>
        }</tbody></table></div></div>
    } @else {
      <form class="card" [formGroup]="roleForm" (ngSubmit)="saveRole()" novalidate>
        <div class="row between wrap gap">
          <h2>{{ editingRole() ? 'Modifier le rôle « ' + editingRole()!.name + ' »' : 'Nouveau rôle' }}</h2>
          @if (!editingRole()) {
            <label class="small">Partir d'un modèle :
              <select class="input" style="width:auto;display:inline-block;min-height:36px" (change)="fromTemplate(+$any($event.target).value)">
                <option value="0">—</option>
                @for (r of templates(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
              </select></label>
          }
        </div>
        @if (roleError()) { <div class="notice error" role="alert">{{ roleError() }}</div> }
        <div class="grid cols-2">
          <div class="field"><label for="rn">Nom du rôle</label><input id="rn" class="input" formControlName="name" maxlength="80" /></div>
          <div class="field"><label for="rd">Description <span class="muted">(facultatif)</span></label><input id="rd" class="input" formControlName="description" maxlength="255" /></div>
        </div>
        <div class="perm-grid" role="group" aria-label="Permissions">
          @for (p of permissions(); track p.key; let i = $index) {
            @if (i === 0 || permissions()[i - 1].group !== p.group) { <div class="perm-group">{{ p.group }}</div> }
            <label class="perm-item" [class.off]="!canGrant([p.key])" [title]="canGrant([p.key]) ? '' : 'Vous n\\'avez pas ce droit : vous ne pouvez pas l\\'accorder.'">
              <input type="checkbox" [checked]="checked().has(p.key)" [disabled]="!canGrant([p.key])" (change)="togglePerm(p.key)" />
              <span>{{ p.label }}@if (p.hint) { <small>{{ p.hint }}</small> }</span>
            </label>
          }
        </div>
        <p class="hint">Cocher une action sur les commandes ajoute automatiquement « Voir les commandes ».</p>
        <div class="row gap wrap">
          <button class="btn" type="submit" [disabled]="saving()">{{ editingRole() ? 'Enregistrer' : 'Créer le rôle' }}</button>
          @if (editingRole()) { <button type="button" class="btn ghost" (click)="resetRoleForm()">Annuler</button> }
        </div>
      </form>

      <div class="stack mt">
        @for (r of roles(); track r.id) {
          <div class="card flat role-card">
            <div class="row between wrap gap">
              <div><strong>{{ r.name }}</strong>
                @if (r.isSystem) { <span class="badge st-CONFIRMEE">Verrouillé</span> } @else if (r.isTemplate) { <span class="badge">Modèle</span> }
                <div class="muted small">{{ r.description || '' }} · {{ r.userCount }} compte(s)</div></div>
              @if (!r.isSystem) {
                <div class="row gap">
                  <button class="btn ghost sm" type="button" [disabled]="r.id === me()?.roleId && !me()?.isMain" (click)="editRole(r)">Modifier</button>
                  <button class="btn danger-ghost sm" type="button" (click)="askDelete.set(r)">Supprimer</button>
                </div>
              }
            </div>
            <div class="role-perms">@for (p of r.permissions; track p) { <span class="badge">{{ label(p) }}</span> } @empty { <span class="muted small">Aucune permission</span> }</div>
          </div>
        }
      </div>
    }

    @if (askOff(); as u) { <app-confirm title="Désactiver ce compte ?" [message]="u.name + ' ne pourra plus se connecter. Vous pourrez le réactiver.'" confirmLabel="Désactiver" [danger]="true" (confirm)="toggle(u, false); askOff.set(null)" (cancel)="askOff.set(null)" /> }
    @if (askDelete(); as r) { <app-confirm title="Supprimer ce rôle ?" [message]="'Le rôle « ' + r.name + ' » sera supprimé. Impossible s\\'il est encore attribué à un compte.'" confirmLabel="Supprimer" [danger]="true" (confirm)="deleteRole(r)" (cancel)="askDelete.set(null)" /> }
    @if (resetFor(); as u) {
      <div class="modal-backdrop" (click)="resetFor.set(null)"><form class="modal" [formGroup]="pwForm" (ngSubmit)="resetPassword(u)" (click)="$event.stopPropagation()">
        <h2>Nouveau mot de passe pour {{ u.name }}</h2>
        <div class="field"><label for="np">Mot de passe (12 caractères minimum)</label><input id="np" class="input" type="password" formControlName="password" autocomplete="new-password" /></div>
        <div class="row end gap"><button type="button" class="btn ghost" (click)="resetFor.set(null)">Annuler</button><button class="btn" type="submit">Enregistrer</button></div>
      </form></div>
    }`,
})
export class AdminTeam implements OnInit {
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  me = inject(AuthService).user;
  tab = signal<'users' | 'roles'>('users');
  users = signal<StaffUser[]>([]); roles = signal<StaffRoleDef[]>([]); permissions = signal<PermissionDef[]>([]);
  loading = signal(true); saving = signal(false); error = signal(''); roleError = signal('');
  askOff = signal<StaffUser | null>(null); resetFor = signal<StaffUser | null>(null); askDelete = signal<StaffRoleDef | null>(null);
  editingRole = signal<StaffRoleDef | null>(null);
  checked = signal<Set<Permission>>(new Set());

  assignable = computed(() => this.roles().filter((r) => !r.isSystem));
  templates = computed(() => this.roles().filter((r) => r.isTemplate));
  form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]], email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(12)]], roleId: [0, Validators.min(1)],
  });
  roleForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.minLength(2)]], description: [''] });
  pwForm = this.fb.nonNullable.group({ password: ['', [Validators.required, Validators.minLength(12)]] });

  selectedRole = () => this.roles().find((r) => r.id === Number(this.form.controls.roleId.value));
  label = (k: string) => this.permissions().find((p) => p.key === k)?.label ?? k;
  permsText = (p: string[]) => (p.length ? p.map((x) => this.label(x)).join(' · ') : 'aucune permission');
  /** Le compte principal peut tout accorder ; les autres, seulement ce qu'ils ont eux-mêmes (miroir de la règle serveur). */
  canGrant = (perms: Permission[]) => !!this.me()?.isMain || perms.every((p) => this.me()?.permissions.includes(p));

  ngOnInit() { this.load(); }
  async load() {
    try {
      const r = await this.api.get<TeamResponse>('/admin/users');
      this.users.set(r.items); this.roles.set(r.roles); this.permissions.set(r.permissions);
      if (!this.form.controls.roleId.value) {
        const first = r.roles.find((x) => !x.isSystem && this.canGrant(x.permissions));
        if (first) this.form.controls.roleId.setValue(first.id);
      }
    } catch (e) { this.toast.error(toApiError(e).message); }
    this.loading.set(false);
  }

  /* ----- Comptes ----- */
  async create() {
    this.error.set('');
    if (this.form.invalid) { this.error.set('Renseignez le nom, un e-mail valide, un mot de passe de 12 caractères minimum et un rôle.'); return; }
    this.saving.set(true);
    const v = this.form.getRawValue();
    try {
      await this.api.post('/admin/users', { ...v, roleId: Number(v.roleId) });
      this.toast.success('Compte créé. Communiquez-lui son e-mail et son mot de passe.');
      this.form.reset({ name: '', email: '', password: '', roleId: v.roleId }); await this.load();
    } catch (e) { const err = toApiError(e); this.error.set(err.details?.[0]?.message ?? err.message); }
    this.saving.set(false);
  }
  async changeRole(u: StaffUser, roleId: number) {
    try { await this.api.patch(`/admin/users/${u.id}`, { roleId }); this.toast.success('Rôle modifié : effet immédiat.'); } catch (e) { this.toast.error(toApiError(e).message); }
    this.load();
  }
  async toggle(u: StaffUser, isActive: boolean) {
    try { await this.api.patch(`/admin/users/${u.id}`, { isActive }); this.load(); } catch (e) { this.toast.error(toApiError(e).message); }
  }
  async resetPassword(u: StaffUser) {
    if (this.pwForm.invalid) { this.toast.error('12 caractères minimum.'); return; }
    try { await this.api.post(`/admin/users/${u.id}/password`, this.pwForm.getRawValue()); this.toast.success('Mot de passe modifié.'); this.resetFor.set(null); this.pwForm.reset(); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }

  /* ----- Rôles ----- */
  togglePerm(k: Permission) {
    const next = new Set(this.checked());
    if (next.has(k)) next.delete(k); else next.add(k);
    if (k !== 'orders.view' && k.startsWith('orders.') && next.has(k)) next.add('orders.view');
    this.checked.set(next);
  }
  fromTemplate(id: number) {
    const r = this.roles().find((x) => x.id === id);
    if (!r) return;
    this.checked.set(new Set(r.permissions.filter((p) => this.canGrant([p]))));
    if (!this.roleForm.controls.name.value) this.roleForm.controls.name.setValue(`${r.name} (copie)`);
  }
  editRole(r: StaffRoleDef) {
    this.editingRole.set(r); this.roleError.set('');
    this.roleForm.reset({ name: r.name, description: r.description ?? '' });
    this.checked.set(new Set(r.permissions));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  resetRoleForm() { this.editingRole.set(null); this.roleForm.reset({ name: '', description: '' }); this.checked.set(new Set()); this.roleError.set(''); }

  async saveRole() {
    this.roleError.set('');
    if (this.roleForm.invalid) { this.roleError.set('Donnez un nom au rôle (2 caractères minimum).'); return; }
    const v = this.roleForm.getRawValue();
    const body = { name: v.name.trim(), description: v.description.trim(), permissions: [...this.checked()] };
    this.saving.set(true);
    try {
      const r = this.editingRole();
      if (r) await this.api.patch(`/admin/roles/${r.id}`, body); else await this.api.post('/admin/roles', body);
      this.toast.success(r ? 'Rôle modifié : effet immédiat pour les comptes concernés.' : 'Rôle créé.');
      this.resetRoleForm(); await this.load();
    } catch (e) { const err = toApiError(e); this.roleError.set(err.details?.[0]?.message ?? err.message); }
    this.saving.set(false);
  }
  async deleteRole(r: StaffRoleDef) {
    this.askDelete.set(null);
    try { await this.api.delete(`/admin/roles/${r.id}`); this.toast.success('Rôle supprimé.'); await this.load(); }
    catch (e) { this.toast.error(toApiError(e).message); }
  }
}
