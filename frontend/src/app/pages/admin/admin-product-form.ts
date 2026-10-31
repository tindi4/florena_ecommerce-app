import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import { AdminCategory, AdminProduct, Attributes } from '../../core/models';
import { compareOptionValues } from '../../core/utils';
import { ImgPipe } from '../../shared/pipes';
import { ConfirmDialog } from '../../shared/confirm-dialog';

const LETTERS_FULL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const LETTERS_SHORT = ['S', 'M', 'L', 'XL'];
const SUGGESTIONS = ['Couleur', 'Taille', 'Pointure', 'Capacité', 'Matière', 'Modèle'];

interface GenRow { name: string; values: string; }

@Component({
  selector: 'app-admin-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ImgPipe, ConfirmDialog],
  template: `
    <a routerLink="/admin/produits" class="small">← Retour aux produits</a>
    <h1 class="mt">{{ isEdit() ? 'Modifier le produit' : 'Nouveau produit' }}</h1>
    @if (loading()) { <div class="spinner"></div> }
    @else {
    @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }
    <form [formGroup]="form" (ngSubmit)="save()" novalidate class="stack">
      <section class="card">
        <h2>Informations</h2>
        <div class="field"><label for="name">Nom du produit</label><input id="name" class="input" formControlName="name" maxlength="200" /></div>
        <div class="grid cols-2">
          <div class="field"><label for="cat">Catégorie</label>
            <select id="cat" class="input" formControlName="categoryId"><option [ngValue]="null">Aucune</option>@for (c of categories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></div>
          <div class="field"><label class="check" style="margin-top:2rem"><input type="checkbox" formControlName="isActive" /> Visible dans la boutique</label></div>
        </div>
        <div class="field"><label for="desc">Description</label><textarea id="desc" class="input" formControlName="description" maxlength="5000" rows="5"></textarea></div>
      </section>

      <section class="card">
        <h2>Images</h2>
        <div class="img-grid">
          @for (im of images(); track im.id) {
            <div class="img-tile"><img [src]="im.url | img" [alt]="im.alt || ''" /><button type="button" class="img-x" (click)="removeImage(im.id)" aria-label="Supprimer l'image">×</button></div>
          }
          @for (f of pending(); track $index) { <div class="img-tile pending"><span class="small">{{ f.name }}</span></div> }
        </div>
        <div class="field"><label for="files">Ajouter des images (JPEG, PNG ou WebP, 5 Mo max)</label>
          <input id="files" class="input" type="file" accept="image/jpeg,image/png,image/webp" multiple (change)="pick($event)" /></div>
        @if (!isEdit()) { <p class="hint">Les images seront envoyées à l'enregistrement du produit.</p> }
      </section>

      <section class="card">
        <h2>Variantes et stock</h2>
        <p class="muted small">Chaque variante a son propre prix et son propre stock. Les options sont libres : couleur, taille en lettres (XS, S, M, L, XL, XXL), pointure en chiffres (40, 41, 42, 45…), capacité, matière…</p>

        <div class="gen card flat">
          <h3>Générer des variantes</h3>
          @for (g of gen(); track $index; let i = $index) {
            <div class="gen-row">
              <div class="field"><label [for]="'gn' + i">Option</label>
                <input [id]="'gn' + i" class="input" list="optnames" [value]="g.name" (input)="setGen(i, 'name', $any($event.target).value)" placeholder="Taille, Pointure, Couleur…" /></div>
              <div class="field grow"><label [for]="'gv' + i">Valeurs (séparées par des virgules)</label>
                <input [id]="'gv' + i" class="input" [value]="g.values" (input)="setGen(i, 'values', $any($event.target).value)" placeholder="ex. Noir, Blanc, Bleu" /></div>
              <button type="button" class="btn ghost sm" (click)="removeGen(i)" [disabled]="gen().length === 1" aria-label="Retirer cette option">✕</button>
            </div>
            <div class="row gap wrap presets">
              <span class="small muted">Remplir :</span>
              <button type="button" class="chip" (click)="fill(i, 'letters-full')">XS → XXL</button>
              <button type="button" class="chip" (click)="fill(i, 'letters-short')">S → XL</button>
              <button type="button" class="chip" (click)="fill(i, 'numbers')">Pointures {{ numFrom() }} → {{ numTo() }}</button>
            </div>
          }
          <datalist id="optnames">@for (s of suggestions; track s) { <option [value]="s"></option> }</datalist>
          <div class="row gap wrap" style="margin:.75rem 0">
            <div class="field" style="margin:0"><label for="nf">Pointure de</label><input id="nf" class="input" style="width:90px" type="number" min="1" max="99" [value]="numFrom()" (input)="numFrom.set(+$any($event.target).value)" /></div>
            <div class="field" style="margin:0"><label for="nt">à</label><input id="nt" class="input" style="width:90px" type="number" min="1" max="99" [value]="numTo()" (input)="numTo.set(+$any($event.target).value)" /></div>
            <div class="field" style="margin:0"><label for="dp">Prix par défaut</label><input id="dp" class="input" style="width:120px" type="number" min="0" step="0.01" [value]="defPrice()" (input)="defPrice.set(+$any($event.target).value)" /></div>
            <div class="field" style="margin:0"><label for="ds">Stock par défaut</label><input id="ds" class="input" style="width:110px" type="number" min="0" step="1" [value]="defStock()" (input)="defStock.set(+$any($event.target).value)" /></div>
          </div>
          <div class="row gap wrap">
            <button type="button" class="btn ghost sm" (click)="addGen()" [disabled]="gen().length >= 4">+ Autre option</button>
            <button type="button" class="btn sm" (click)="generate()">Générer les variantes</button>
          </div>
          <p class="hint">Toutes les combinaisons sont créées ; supprimez ensuite celles que vous ne proposez pas.</p>
        </div>

        @if (!variants.length) { <p class="notice warn">Aucune variante : ajoutez-en au moins une.</p> }
        @else {
          <div class="table-wrap"><table class="tbl vtable">
            <thead><tr>@for (n of optionNames(); track n) { <th>{{ n }}</th> }<th>SKU</th><th class="num">Prix</th><th class="num">Stock</th><th>Actif</th><th></th></tr></thead>
            <tbody>
              @for (g of variantGroups(); track g; let i = $index) {
                <tr [formGroup]="g">
                  @for (n of optionNames(); track n) { <td><input class="input" style="min-width:90px" [value]="attr(g, n)" (input)="setAttr(g, n, $any($event.target).value)" [attr.aria-label]="n" /></td> }
                  <td><input class="input" style="min-width:110px" formControlName="sku" maxlength="80" aria-label="SKU" /></td>
                  <td><input class="input" style="width:110px" type="number" min="0" step="0.01" formControlName="price" aria-label="Prix" /></td>
                  <td><input class="input" style="width:90px" type="number" min="0" step="1" formControlName="stockQuantity" aria-label="Stock" /></td>
                  <td><input type="checkbox" formControlName="isActive" aria-label="Variante active" style="width:20px;height:20px" /></td>
                  <td><button type="button" class="btn sm danger-ghost" (click)="askRemove.set(i)" aria-label="Supprimer la variante">✕</button></td>
                </tr>
              }
            </tbody></table></div>
        }
        <div class="row gap wrap mt-s"><button type="button" class="btn ghost sm" (click)="addVariant()">+ Ajouter une variante manuellement</button></div>
      </section>

      <div class="row gap wrap sticky-actions">
        <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : 'Enregistrer le produit' }}</button>
        <a class="btn ghost" routerLink="/admin/produits">Annuler</a>
      </div>
    </form>
    @if (askRemove() !== null) { <app-confirm title="Supprimer cette variante ?" message="Si elle a déjà été commandée, elle sera seulement désactivée pour conserver l'historique des commandes." confirmLabel="Supprimer" [danger]="true" (confirm)="removeVariant(askRemove()!)" (cancel)="askRemove.set(null)" /> }
    }`,
})
export class AdminProductForm implements OnInit {
  id = input<string>();
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toast = inject(ToastService);

  suggestions = SUGGESTIONS;
  isEdit = computed(() => !!this.id());
  loading = signal(true); saving = signal(false); error = signal('');
  categories = signal<AdminCategory[]>([]);
  images = signal<{ id: number; url: string; alt: string | null }[]>([]);
  pending = signal<File[]>([]);
  askRemove = signal<number | null>(null);
  gen = signal<GenRow[]>([{ name: 'Taille', values: '' }]);
  numFrom = signal(36); numTo = signal(47); defPrice = signal(0); defStock = signal(0);
  private rev = signal(0);

  form = this.fb.group({
    name: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(2)]),
    categoryId: new FormControl<number | null>(null),
    description: this.fb.nonNullable.control(''),
    isActive: this.fb.nonNullable.control(true),
  });
  variants = new FormArray<FormGroup>([]);
  variantGroups = computed(() => { this.rev(); return [...this.variants.controls]; });
  optionNames = computed(() => {
    this.rev();
    const names: string[] = [];
    for (const g of this.variants.controls) for (const k of Object.keys(g.value.attributes ?? {})) if (!names.includes(k)) names.push(k);
    return names;
  });

  private makeVariant(v?: Partial<{ id: number; sku: string | null; attributes: Attributes; price: number; stockQuantity: number; isActive: boolean }>): FormGroup {
    return this.fb.group({
      id: [v?.id ?? null], sku: [v?.sku ?? ''], attributes: [v?.attributes ?? {}],
      price: [v?.price ?? this.defPrice(), [Validators.required, Validators.min(0)]],
      stockQuantity: [v?.stockQuantity ?? this.defStock(), [Validators.required, Validators.min(0)]],
      isActive: [v?.isActive ?? true],
    });
  }

  async ngOnInit() {
    try { this.categories.set((await this.api.get<{ items: AdminCategory[] }>('/admin/categories')).items); } catch { /* ignore */ }
    const id = this.id();
    if (id) {
      try {
        const p = await this.api.get<AdminProduct>(`/admin/products/${id}`);
        this.form.patchValue({ name: p.name, categoryId: p.categoryId, description: p.description ?? '', isActive: p.isActive });
        this.images.set(p.images);
        p.variants.forEach((v) => this.variants.push(this.makeVariant(v)));
        const first = p.variants[0];
        if (first) this.gen.set(Object.keys(first.attributes).length ? [{ name: Object.keys(first.attributes)[0], values: '' }] : [{ name: 'Taille', values: '' }]);
      } catch (e) { this.error.set(toApiError(e).message); }
    } else {
      this.variants.push(this.makeVariant());
    }
    this.rev.update((r) => r + 1);
    this.loading.set(false);
  }

  attr(g: FormGroup, name: string): string { return (g.value.attributes ?? {})[name] ?? ''; }
  setAttr(g: FormGroup, name: string, value: string) { g.get('attributes')!.setValue({ ...(g.value.attributes ?? {}), [name]: value }); }

  setGen(i: number, key: keyof GenRow, value: string) { this.gen.update((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r))); }
  addGen() { this.gen.update((r) => [...r, { name: '', values: '' }]); }
  removeGen(i: number) { this.gen.update((r) => r.filter((_, idx) => idx !== i)); }
  fill(i: number, preset: 'letters-full' | 'letters-short' | 'numbers') {
    let values: string[];
    if (preset === 'numbers') {
      const from = Math.max(1, Math.min(this.numFrom(), this.numTo())); const to = Math.min(99, Math.max(this.numFrom(), this.numTo()));
      values = Array.from({ length: to - from + 1 }, (_, k) => String(from + k));
      if (!this.gen()[i].name.trim() || this.gen()[i].name === 'Taille') this.setGen(i, 'name', 'Pointure');
    } else {
      values = preset === 'letters-full' ? LETTERS_FULL : LETTERS_SHORT;
      if (!this.gen()[i].name.trim() || this.gen()[i].name === 'Pointure') this.setGen(i, 'name', 'Taille');
    }
    this.setGen(i, 'values', values.join(', '));
  }

  /** Produit cartésien des options saisies ; les combinaisons déjà présentes sont conservées telles quelles. */
  generate() {
    const rows = this.gen().map((r) => ({
      name: r.name.trim(),
      values: [...new Set(r.values.split(',').map((v) => v.trim()).filter(Boolean))].sort(compareOptionValues),
    })).filter((r) => r.name && r.values.length);
    if (!rows.length) { this.toast.error('Indiquez au moins une option avec ses valeurs.'); return; }
    if (new Set(rows.map((r) => r.name.toLowerCase())).size !== rows.length) { this.toast.error('Deux options portent le même nom.'); return; }
    let combos: Attributes[] = [{}];
    for (const r of rows) combos = combos.flatMap((c) => r.values.map((v) => ({ ...c, [r.name]: v })));
    if (combos.length > 300) { this.toast.error('Trop de combinaisons (300 maximum).'); return; }

    // Retire les lignes vides non enregistrées (variante « sans option » par défaut).
    for (let i = this.variants.length - 1; i >= 0; i--) {
      const g = this.variants.at(i);
      if (!g.value.id && Object.keys(g.value.attributes ?? {}).length === 0) this.variants.removeAt(i);
    }
    const key = (a: Attributes) => JSON.stringify(Object.keys(a).sort().map((k) => [k.toLowerCase(), String(a[k]).toLowerCase()]));
    const existing = new Set(this.variants.controls.map((g) => key(g.value.attributes ?? {})));
    let added = 0;
    for (const c of combos) {
      if (existing.has(key(c))) continue;
      this.variants.push(this.makeVariant({ attributes: c })); added++;
    }
    this.rev.update((r) => r + 1);
    this.toast.success(added ? `${added} variante(s) ajoutée(s). Renseignez les prix et les stocks.` : 'Ces variantes existent déjà.');
  }

  addVariant() {
    const attrs: Attributes = {};
    for (const n of this.optionNames()) attrs[n] = '';
    this.variants.push(this.makeVariant({ attributes: attrs })); this.rev.update((r) => r + 1);
  }
  removeVariant(i: number) { this.variants.removeAt(i); this.askRemove.set(null); this.rev.update((r) => r + 1); }

  pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    for (const f of files) if (f.size > 5 * 1024 * 1024) { this.toast.error(`« ${f.name} » dépasse 5 Mo.`); return; }
    if (this.isEdit()) this.upload(this.id()!, files); else this.pending.update((p) => [...p, ...files]);
  }
  private async upload(productId: string | number, files: File[]) {
    for (const f of files) {
      const fd = new FormData(); fd.append('image', f); fd.append('alt', this.form.getRawValue().name);
      try { const im = await this.api.upload<{ id: number; url: string; alt: string | null }>(`/admin/products/${productId}/images`, fd); this.images.update((l) => [...l, im]); }
      catch (e) { this.toast.error(`${f.name} : ${toApiError(e).message}`); }
    }
  }
  async removeImage(imageId: number) {
    try { await this.api.delete(`/admin/images/${imageId}`); this.images.update((l) => l.filter((i) => i.id !== imageId)); } catch (e) { this.toast.error(toApiError(e).message); }
  }

  async save() {
    this.error.set('');
    this.form.markAllAsTouched(); this.variants.markAllAsTouched();
    if (this.form.invalid) { this.error.set('Indiquez le nom du produit.'); return; }
    if (!this.variants.length) { this.error.set('Ajoutez au moins une variante.'); return; }
    if (this.variants.invalid) { this.error.set('Vérifiez les prix et les stocks : valeurs positives ou nulles uniquement.'); return; }
    const raw = this.form.getRawValue();
    const payload = {
      name: raw.name, categoryId: raw.categoryId, description: raw.description, isActive: raw.isActive,
      variants: this.variants.controls.map((g) => {
        const v = g.getRawValue();
        const attributes: Attributes = {};
        for (const [k, val] of Object.entries(v.attributes as Attributes)) if (String(val).trim()) attributes[k] = String(val).trim();
        return { ...(v.id ? { id: v.id } : {}), sku: v.sku || undefined, attributes, price: Number(v.price), stockQuantity: Number(v.stockQuantity), isActive: !!v.isActive };
      }),
    };
    this.saving.set(true);
    try {
      if (this.isEdit()) {
        const p = await this.api.put<AdminProduct>(`/admin/products/${this.id()}`, payload);
        this.variants.clear(); p.variants.forEach((v) => this.variants.push(this.makeVariant(v))); this.rev.update((r) => r + 1);
        this.toast.success('Produit enregistré.');
      } else {
        const p = await this.api.post<AdminProduct>('/admin/products', payload);
        await this.upload(p.id, this.pending());
        this.toast.success('Produit créé.');
        await this.router.navigate(['/admin/produits', p.id]);
      }
    } catch (e) {
      const err = toApiError(e);
      this.error.set(err.details?.[0]?.message ? `${err.message} ${err.details[0].field ? '(' + err.details[0].field + ') ' : ''}${err.details[0].message}` : err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    this.saving.set(false);
  }
}
