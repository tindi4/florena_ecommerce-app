import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ApiService, toApiError } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { ToastService } from '../../core/toast.service';
import { AdminCategory, AdminProduct, Attributes } from '../../core/models';
import { compareOptionValues } from '../../core/utils';
import { ImgPipe } from '../../shared/pipes';
import { ConfirmDialog } from '../../shared/confirm-dialog';

const LETTERS_FULL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const LETTERS_SHORT = ['S', 'M', 'L', 'XL'];
const SUGGESTIONS = ['Couleur', 'Taille', 'Pointure', 'Capacité', 'Matière', 'Modèle'];

interface GenRow { name: string; values: string; }

/** Les quatre étapes du formulaire, avec le conseil affiché à côté de chacune. */
const STEPS = [
  { t: 'L\'article', s: 'Nom et description', tipTitle: 'Un nom qui parle', tip: 'Dites ce que c\'est, la matière et la couleur : « Sac cabas en cuir camel » se trouve et se retient mieux que « Sac 12 ».' },
  { t: 'Photos', s: 'Ce que voit le client', tipTitle: 'La photo fait la vente', tip: 'Photographiez l\'article à la lumière du jour, sur un fond clair et uni. Deux ou trois angles suffisent.' },
  { t: 'Prix et stock', s: 'Tailles, pointures, couleurs', tipTitle: 'Une ligne par déclinaison', tip: 'Chaque taille ou couleur a son propre stock : quand l\'une est épuisée, les autres restent en vente.' },
  { t: 'Vérification', s: 'Avant de publier', tipTitle: 'Rien n\'est définitif', tip: 'Vous pourrez modifier l\'article, ses photos et ses stocks à tout moment depuis la liste des articles.' },
];

@Component({
  selector: 'app-admin-product-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ImgPipe, ConfirmDialog],
  template: `
    <a routerLink="/admin/produits" class="small">← Retour aux articles</a>
    <div class="adm-head mt-s">
      <h1>{{ isEdit() ? 'Modifier l’article' : 'Nouvel article' }}</h1>
      <p class="muted">{{ isEdit() ? 'Passez d’une étape à l’autre, puis enregistrez.' : 'Quatre étapes courtes : laissez-vous guider.' }}</p>
    </div>
    @if (loading()) { <div class="spinner"></div> }
    @else {
    <ol class="wiz-steps" aria-label="Étapes">
      @for (s of steps; track s.t; let i = $index) {
        <li><button type="button" class="wiz-step" [class.on]="step() === i" [class.done]="step() > i" [attr.aria-current]="step() === i ? 'step' : null" (click)="goTo(i)">
          <span class="wiz-num">@if (step() > i) { ✓ } @else { {{ i + 1 }} }</span>
          <span class="wiz-lbl"><strong>{{ s.t }}</strong><small>{{ s.s }}</small></span>
        </button></li>
      }
    </ol>
    @if (error()) { <div class="notice error" role="alert">{{ error() }}</div> }

    <form [formGroup]="form" (ngSubmit)="save()" novalidate class="wiz-body">
      <div class="wiz-main">
        @switch (step()) {
          @case (0) {
            <section class="card">
              <h2>Présentez votre article</h2>
              <div class="field" [class.invalid]="form.controls.name.invalid && form.controls.name.touched"><label for="name">Comment s'appelle-t-il ?</label>
                <input id="name" class="input" formControlName="name" maxlength="200" placeholder="ex. Sac cabas en cuir camel" />
                <span class="hint">Le nom que le client verra dans la boutique.</span></div>

              <div class="field"><span class="lbl">Dans quelle catégorie le ranger ?</span>
                <div class="choice-grid" role="radiogroup" aria-label="Catégorie">
                  @for (c of categories(); track c.id) {
                    <button type="button" class="choice" role="radio" [class.on]="form.controls.categoryId.value === c.id" [attr.aria-checked]="form.controls.categoryId.value === c.id" (click)="form.controls.categoryId.setValue(c.id)">{{ c.name }}</button>
                  }
                  <button type="button" class="choice" role="radio" [class.on]="form.controls.categoryId.value === null" [attr.aria-checked]="form.controls.categoryId.value === null" (click)="form.controls.categoryId.setValue(null)">Aucune pour l'instant</button>
                </div>
                @if (!categories().length) { <span class="hint">Aucune catégorie créée pour le moment : vous pourrez en ajouter dans le menu « Catégories de produits ».</span> }
              </div>

              <div class="field"><label for="desc">Décrivez-le en quelques mots <span class="muted">(facultatif)</span></label>
                <textarea id="desc" class="input" formControlName="description" maxlength="5000" rows="4" placeholder="Matière, dimensions, entretien, ce qui le rend unique…"></textarea></div>
            </section>
          }
          @case (1) {
            <section class="card">
              <h2>Ajoutez des photos</h2>
              <label class="dropzone" for="files">
                <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="m21 16-5-5-8 8"/></svg>
                <strong>Choisir des photos</strong>
                <span>JPEG, PNG ou WebP · 5 Mo maximum par photo</span>
                <input id="files" class="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple (change)="pick($event)" />
              </label>
              @if (images().length || pending().length) {
                <div class="img-grid mt-s">
                  @for (im of images(); track im.id) {
                    <div class="img-tile"><img [src]="im.url | img" [alt]="im.alt || ''" /><button type="button" class="img-x" (click)="removeImage(im.id)" aria-label="Supprimer la photo">×</button></div>
                  }
                  @for (p of previews(); track p; let i = $index) {
                    <div class="img-tile"><img [src]="p" alt="" /><button type="button" class="img-x" (click)="removePending(i)" aria-label="Retirer la photo">×</button></div>
                  }
                </div>
                <p class="hint">La première photo sert de couverture dans la boutique.@if (!isEdit() && pending().length) { Les photos seront envoyées à l'enregistrement. }</p>
              } @else { <p class="hint mt-s">Vous pouvez passer cette étape et ajouter les photos plus tard.</p> }
            </section>
          }
          @case (2) {
            <section class="card">
              <h2>Prix et stock</h2>
              <span class="lbl">Cet article existe-t-il en plusieurs tailles, pointures ou couleurs ?</span>
              <div class="choice-grid big" role="radiogroup" aria-label="Déclinaisons">
                <button type="button" class="choice" role="radio" [class.on]="!multi()" [attr.aria-checked]="!multi()" (click)="setMulti(false)"><strong>Non, un seul modèle</strong><small>Un prix et un stock, c'est tout.</small></button>
                <button type="button" class="choice" role="radio" [class.on]="multi()" [attr.aria-checked]="multi()" (click)="setMulti(true)"><strong>Oui, plusieurs déclinaisons</strong><small>Par exemple S, M, L ou 38, 39, 40.</small></button>
              </div>

              @if (!multi()) {
                @if (variantGroups()[0]; as g) {
                  <div class="grid cols-2 mt" [formGroup]="g">
                    <div class="field"><label for="sp">Prix de vente ({{ cfg.currency() }})</label><input id="sp" class="input" type="number" min="0" step="0.01" formControlName="price" /></div>
                    <div class="field"><label for="ss">Quantité en stock</label><input id="ss" class="input" type="number" min="0" step="1" formControlName="stockQuantity" /></div>
                  </div>
                }
              } @else {
                <div class="gen mt">
                  <h3>1. Quelles déclinaisons proposez-vous ?</h3>
                  @for (g of gen(); track $index; let i = $index) {
                    <div class="gen-row">
                      <div class="field"><label [for]="'gn' + i">Type</label>
                        <input [id]="'gn' + i" class="input" list="optnames" [value]="g.name" (input)="setGen(i, 'name', $any($event.target).value)" placeholder="Taille, Pointure, Couleur…" /></div>
                      <div class="field grow"><label [for]="'gv' + i">Valeurs, séparées par des virgules</label>
                        <input [id]="'gv' + i" class="input" [value]="g.values" (input)="setGen(i, 'values', $any($event.target).value)" placeholder="ex. Noir, Camel, Bordeaux" /></div>
                      @if (gen().length > 1) { <button type="button" class="btn ghost sm" (click)="removeGen(i)" aria-label="Retirer ce type">✕</button> }
                    </div>
                    <div class="row gap wrap presets">
                      <span class="small muted">Remplir d'un clic :</span>
                      <button type="button" class="chip" (click)="fill(i, 'letters-short')">S → XL</button>
                      <button type="button" class="chip" (click)="fill(i, 'letters-full')">XS → XXL</button>
                      <button type="button" class="chip" (click)="fill(i, 'numbers')">Pointures {{ numFrom() }} → {{ numTo() }}</button>
                    </div>
                  }
                  <datalist id="optnames">@for (s of suggestions; track s) { <option [value]="s"></option> }</datalist>
                  <button type="button" class="link-btn small" (click)="addGen()" [disabled]="gen().length >= 4">+ Combiner avec un autre type (ex. taille et couleur)</button>

                  <h3 class="mt">2. Prix et stock de départ</h3>
                  <div class="row gap wrap">
                    <div class="field" style="margin:0"><label for="dp">Prix ({{ cfg.currency() }})</label><input id="dp" class="input" style="width:130px" type="number" min="0" step="0.01" [value]="defPrice()" (input)="defPrice.set(+$any($event.target).value)" /></div>
                    <div class="field" style="margin:0"><label for="ds">Stock de chacune</label><input id="ds" class="input" style="width:130px" type="number" min="0" step="1" [value]="defStock()" (input)="defStock.set(+$any($event.target).value)" /></div>
                    @if (advanced()) {
                      <div class="field" style="margin:0"><label for="nf">Pointures de</label><input id="nf" class="input" style="width:90px" type="number" min="1" max="99" [value]="numFrom()" (input)="numFrom.set(+$any($event.target).value)" /></div>
                      <div class="field" style="margin:0"><label for="nt">à</label><input id="nt" class="input" style="width:90px" type="number" min="1" max="99" [value]="numTo()" (input)="numTo.set(+$any($event.target).value)" /></div>
                    }
                  </div>
                  <div class="row gap wrap mt-s"><button type="button" class="btn sm" (click)="generate()">Créer les déclinaisons</button></div>
                </div>

                @if (hasOptions()) {
                  <h3 class="mt">3. Ajustez si besoin</h3>
                  <div class="table-wrap"><table class="tbl vtable">
                    <thead><tr>@for (n of optionNames(); track n) { <th>{{ n }}</th> }@if (advanced()) { <th>Référence</th> }<th class="num">Prix</th><th class="num">Stock</th>@if (advanced()) { <th>En vente</th> }<th></th></tr></thead>
                    <tbody>
                      @for (g of variantGroups(); track g; let i = $index) {
                        <tr [formGroup]="g">
                          @for (n of optionNames(); track n) { <td><input class="input" style="min-width:90px" [value]="attr(g, n)" (input)="setAttr(g, n, $any($event.target).value)" [attr.aria-label]="n" /></td> }
                          @if (advanced()) { <td><input class="input" style="min-width:110px" formControlName="sku" maxlength="80" aria-label="Référence" /></td> }
                          <td><input class="input" style="width:110px" type="number" min="0" step="0.01" formControlName="price" aria-label="Prix" /></td>
                          <td><input class="input" style="width:90px" type="number" min="0" step="1" formControlName="stockQuantity" aria-label="Stock" /></td>
                          @if (advanced()) { <td><input type="checkbox" formControlName="isActive" aria-label="En vente" style="width:20px;height:20px" /></td> }
                          <td><button type="button" class="btn sm danger-ghost" (click)="askRemove.set(i)" aria-label="Supprimer la déclinaison">✕</button></td>
                        </tr>
                      }
                    </tbody></table></div>
                  <div class="row gap wrap mt-s"><button type="button" class="link-btn small" (click)="addVariant()">+ Ajouter une ligne à la main</button></div>
                }
                <label class="check small mt"><input type="checkbox" [checked]="advanced()" (change)="advanced.set(!advanced())" /> Afficher les options avancées (référence, mise en vente, plage de pointures)</label>
              }
            </section>
          }
          @case (3) {
            <section class="card">
              <h2>Tout est prêt ?</h2>
              <dl class="recap">
                <div><dt>Article</dt><dd>{{ form.controls.name.value || '—' }}</dd><button type="button" class="link-btn small" (click)="goTo(0)">Modifier</button></div>
                <div><dt>Catégorie</dt><dd>{{ categoryName() }}</dd><button type="button" class="link-btn small" (click)="goTo(0)">Modifier</button></div>
                <div><dt>Photos</dt><dd>{{ images().length + pending().length }}</dd><button type="button" class="link-btn small" (click)="goTo(1)">Modifier</button></div>
                <div><dt>Prix</dt><dd>{{ priceLabel() }}</dd><button type="button" class="link-btn small" (click)="goTo(2)">Modifier</button></div>
                <div><dt>Stock total</dt><dd>{{ totalStock() }}@if (variants.length > 1) { <span class="muted"> · {{ variants.length }} déclinaisons</span> }</dd><button type="button" class="link-btn small" (click)="goTo(2)">Modifier</button></div>
              </dl>
              @for (w of warnings(); track w) { <p class="notice warn">{{ w }}</p> }
              <label class="check mt"><input type="checkbox" formControlName="isActive" /> Mettre en vente dans la boutique dès l'enregistrement</label>
              <p class="hint">Décochez pour préparer l'article sans le montrer aux clients.</p>
            </section>
          }
        }

        <div class="row gap wrap between wiz-actions">
          <div class="row gap wrap">
            @if (step() > 0) { <button type="button" class="btn ghost" (click)="goTo(step() - 1)">← Précédent</button> }
            @else { <a class="btn ghost" routerLink="/admin/produits">Annuler</a> }
          </div>
          <div class="row gap wrap">
            @if (isEdit() && step() < 3) { <button class="btn ghost" type="submit" [disabled]="saving()">Enregistrer</button> }
            @if (step() < 3) { <button type="button" class="btn" (click)="next()">Continuer →</button> }
            @else { <button class="btn" type="submit" [disabled]="saving()">{{ saving() ? 'Enregistrement…' : (isEdit() ? 'Enregistrer l’article' : 'Publier l’article') }}</button> }
          </div>
        </div>
      </div>

      <aside class="wiz-tip">
        <strong>💡 {{ steps[step()].tipTitle }}</strong>
        <p>{{ steps[step()].tip }}</p>
      </aside>
    </form>
    @if (askRemove() !== null) { <app-confirm title="Supprimer cette déclinaison ?" message="Si elle a déjà été commandée, elle sera seulement désactivée pour conserver l'historique des commandes." confirmLabel="Supprimer" [danger]="true" (confirm)="removeVariant(askRemove()!)" (cancel)="askRemove.set(null)" /> }
    }`,
})
export class AdminProductForm implements OnInit {
  id = input<string>();
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private toast = inject(ToastService);

  cfg = inject(ConfigService);
  suggestions = SUGGESTIONS;
  steps = STEPS;
  step = signal(0);
  /** Vrai si l'article se décline (tailles, pointures, couleurs…) ; faux pour un modèle unique. */
  multi = signal(false);
  advanced = signal(false);
  isEdit = computed(() => !!this.id());
  loading = signal(true); saving = signal(false); error = signal('');
  categories = signal<AdminCategory[]>([]);
  images = signal<{ id: number; url: string; alt: string | null }[]>([]);
  pending = signal<File[]>([]);
  askRemove = signal<number | null>(null);
  gen = signal<GenRow[]>([{ name: 'Taille', values: '' }]);
  numFrom = signal(36); numTo = signal(47); defPrice = signal(0); defStock = signal(0);
  private rev = signal(0);
  /** Aperçus des photos choisies mais pas encore envoyées. */
  previews = computed(() => this.pending().map((f) => URL.createObjectURL(f)));
  hasOptions = computed(() => this.optionNames().length > 0);
  categoryName = computed(() => { this.rev(); const id = this.form.controls.categoryId.value; return this.categories().find((c) => c.id === id)?.name ?? 'Aucune'; });
  private prices = () => this.variants.controls.map((g) => Number(g.value.price) || 0);
  priceLabel = computed(() => {
    this.rev();
    const p = this.prices(); if (!p.length) return '—';
    const min = Math.min(...p), max = Math.max(...p), cur = this.cfg.currency();
    return min === max ? `${min} ${cur}` : `de ${min} à ${max} ${cur}`;
  });
  totalStock = computed(() => { this.rev(); return this.variants.controls.reduce((n, g) => n + (Number(g.value.stockQuantity) || 0), 0); });
  warnings = computed(() => {
    this.rev();
    const w: string[] = [];
    if (!this.images().length && !this.pending().length) w.push('Aucune photo : un article illustré se vend bien mieux.');
    if (this.prices().some((p) => p <= 0)) w.push('Un prix est à 0 : vérifiez l\'étape « Prix et stock ».');
    if (this.totalStock() === 0) w.push('Le stock est à 0 : l\'article apparaîtra comme épuisé.');
    return w;
  });

  /** Vérifie l'étape en cours avant d'avancer ; revenir en arrière est toujours permis. */
  private stepError(i: number): string {
    if (i === 0 && this.form.controls.name.invalid) { this.form.controls.name.markAsTouched(); return 'Donnez un nom à l\'article (2 caractères minimum).'; }
    if (i === 2) {
      this.variants.markAllAsTouched();
      if (!this.variants.length) return 'Indiquez au moins un prix et un stock.';
      if (this.variants.invalid) return 'Vérifiez les prix et les stocks : valeurs positives ou nulles uniquement.';
    }
    return '';
  }
  goTo(i: number) {
    for (let k = this.step(); k < i; k++) { const e = this.stepError(k); if (e) { this.step.set(k); this.error.set(e); return; } }
    this.error.set(''); this.rev.update((r) => r + 1); this.step.set(i);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  next() { this.goTo(Math.min(this.step() + 1, STEPS.length - 1)); }

  setMulti(on: boolean) {
    if (on) { this.multi.set(true); return; }
    const declined = this.variants.length > 1 || this.variants.controls.some((g) => Object.keys(g.value.attributes ?? {}).length);
    if (declined) {
      if (this.variants.controls.some((g) => g.value.id)) { this.toast.error('Cet article a déjà des déclinaisons enregistrées : supprimez-les d\'abord une à une.'); return; }
      this.variants.clear(); this.variants.push(this.makeVariant());
    }
    if (!this.variants.length) this.variants.push(this.makeVariant());
    this.multi.set(false); this.rev.update((r) => r + 1);
  }
  removePending(i: number) { this.pending.update((p) => p.filter((_, k) => k !== i)); }

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
        this.multi.set(p.variants.length > 1 || (!!first && Object.keys(first.attributes).length > 0));
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
    if (!rows.length) { this.toast.error('Indiquez un type (taille, couleur…) et ses valeurs.'); return; }
    if (new Set(rows.map((r) => r.name.toLowerCase())).size !== rows.length) { this.toast.error('Deux types portent le même nom.'); return; }
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
    this.toast.success(added ? `${added} déclinaison(s) créée(s). Ajustez les prix et les stocks si besoin.` : 'Ces déclinaisons existent déjà.');
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
    if (this.form.invalid) { this.step.set(0); this.error.set('Donnez un nom à l\'article.'); return; }
    if (!this.variants.length) { this.step.set(2); this.error.set('Indiquez au moins un prix et un stock.'); return; }
    if (this.variants.invalid) { this.step.set(2); this.error.set('Vérifiez les prix et les stocks : valeurs positives ou nulles uniquement.'); return; }
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
        this.toast.success('Article enregistré.');
      } else {
        const p = await this.api.post<AdminProduct>('/admin/products', payload);
        await this.upload(p.id, this.pending());
        this.toast.success('Article publié.');
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
