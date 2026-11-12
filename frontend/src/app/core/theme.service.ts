import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';
const KEY = 'boutique.theme';

/**
 * Thème clair / sombre du site public : attribut data-theme sur <html> (les couleurs sont des variables CSS, voir styles.css).
 * Mémorisé sur l'appareil (affiché dès l'ouverture) et dans le compte client (retrouvé sur un autre appareil).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.read());
  constructor() { this.apply(this.theme()); }

  private read(): Theme {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
  }
  set(theme: Theme) {
    this.theme.set(theme);
    this.apply(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* stockage indisponible */ }
  }
  private apply(theme: Theme) { document.documentElement.setAttribute('data-theme', theme); }
}
