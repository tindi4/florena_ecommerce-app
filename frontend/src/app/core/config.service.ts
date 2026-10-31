import { Injectable, signal } from '@angular/core';

/** Charge /config.json (URL de l'API) puis les réglages de la boutique (nom, devise). Modifiable sans recompiler. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  apiUrl = 'http://localhost:3000';
  readonly shopName = signal('Ma Boutique');
  readonly currency = signal('EUR');

  async load(): Promise<void> {
    try {
      const cfg = await (await fetch('/config.json', { cache: 'no-store' })).json();
      if (cfg.apiUrl !== undefined) this.apiUrl = String(cfg.apiUrl).replace(/\/$/, '');
    } catch { /* valeur par défaut */ }
    try {
      const s = await (await fetch(`${this.apiUrl}/api/settings`)).json();
      this.shopName.set(s.shopName);
      this.currency.set(s.currency);
      document.title = s.shopName;
    } catch { /* API indisponible : la page affichera ses propres erreurs */ }
  }

  /** Transforme /uploads/xxx.jpg en URL absolue. */
  imageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.apiUrl}${url}`;
  }
}
