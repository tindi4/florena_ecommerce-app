import { Attributes, Variant } from './models';

const LETTER_ORDER = ['XXXS', 'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', 'XXXL', '3XL', '4XL', '5XL'];

/** Trie des valeurs d'option : tailles en lettres (XS→XXL), nombres (36→47), sinon alphabétique. */
export function compareOptionValues(a: string, b: string): number {
  const ia = LETTER_ORDER.indexOf(a.toUpperCase());
  const ib = LETTER_ORDER.indexOf(b.toUpperCase());
  if (ia >= 0 && ib >= 0) return ia - ib;
  const na = parseFloat(a.replace(',', '.'));
  const nb = parseFloat(b.replace(',', '.'));
  if (!isNaN(na) && !isNaN(nb) && String(na) === a.replace(',', '.') && String(nb) === b.replace(',', '.')) return na - nb;
  return a.localeCompare(b, 'fr', { numeric: true });
}

export interface OptionGroup { name: string; values: string[]; }

/** Déduit les groupes d'options (Couleur, Taille, Pointure…) à partir des variantes. Rien n'est codé en dur. */
export function buildOptionGroups(variants: { attributes: Attributes }[]): OptionGroup[] {
  const order: string[] = [];
  const map = new Map<string, Set<string>>();
  for (const v of variants) {
    for (const [k, val] of Object.entries(v.attributes)) {
      if (!map.has(k)) { map.set(k, new Set()); order.push(k); }
      map.get(k)!.add(val);
    }
  }
  return order.map((name) => ({ name, values: [...map.get(name)!].sort(compareOptionValues) }));
}

export function findVariant(variants: Variant[], selection: Attributes): Variant | undefined {
  return variants.find((v) => {
    const keys = Object.keys(v.attributes);
    return keys.length === Object.keys(selection).length && keys.every((k) => selection[k] === v.attributes[k]);
  });
}

export const attributesLabel = (a: Attributes | undefined | null): string =>
  a ? Object.entries(a).map(([k, v]) => `${k} : ${v}`).join(' · ') : '';

export function newIdempotencyKey(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Télécharge un fichier reçu de l'API (PDF…). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
