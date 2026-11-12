import { Injectable, signal } from '@angular/core';

export interface DeliverySettings { suggestedFee: number; }
export interface ShopBranding { shopName: string; primaryColor: string; logoUrl: string | null; }

/** Charge /config.json (URL de l'API, clé Google Maps) puis les réglages de la boutique. Modifiable sans recompiler. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  apiUrl = 'http://localhost:3000';
  googleMapsApiKey = '';
  defaultMapCenter = { lat: 6.1725, lng: 1.2314 };
  readonly shopName = signal('Ma Boutique');
  readonly currency = signal('EUR');
  readonly delivery = signal<DeliverySettings>({ suggestedFee: 1000 });
  readonly shopWhatsapp = signal('');
  readonly primaryColor = signal('#0d4f4c');
  readonly logoUrl = signal<string | null>(null);   // URL absolue du logo (ou null)

  async load(): Promise<void> {
    try {
      const cfg = await (await fetch('/config.json', { cache: 'no-store' })).json();
      if (cfg.apiUrl !== undefined) this.apiUrl = String(cfg.apiUrl).replace(/\/$/, '');
      if (cfg.googleMapsApiKey) this.googleMapsApiKey = String(cfg.googleMapsApiKey);
      if (cfg.defaultMapCenter) this.defaultMapCenter = cfg.defaultMapCenter;
    } catch { /* valeurs par défaut */ }
    try {
      const s = await (await fetch(`${this.apiUrl}/api/settings`)).json();
      this.applyBranding(s);
      this.currency.set(s.currency);
      if (s.delivery) this.delivery.set(s.delivery);
      this.shopWhatsapp.set(s.shopWhatsapp || '');
    } catch { /* API indisponible : la page affichera ses propres erreurs */ }
  }

  /**
   * Applique le nom, le logo et la couleur réglés dans l'administration.
   * La couleur est posée dans la variable CSS --brand : tout le site (public, admin, connexion) suit.
   */
  applyBranding(s: ShopBranding) {
    this.shopName.set(s.shopName);
    this.logoUrl.set(this.imageUrl(s.logoUrl));
    if (/^#[0-9a-f]{6}$/i.test(s.primaryColor || '')) {
      this.primaryColor.set(s.primaryColor);
      const root = document.documentElement.style;
      root.setProperty('--brand', s.primaryColor);
      root.setProperty('--brand-ink', textColorOn(s.primaryColor));
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.primaryColor);
    }
    document.title = s.shopName;
  }

  /** Lien « Continuer sur WhatsApp » vers la boutique (vide si le numéro n'est pas configuré). */
  whatsappLink(message: string): string | null {
    const n = this.shopWhatsapp();
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(message)}` : null;
  }

  /** Transforme /uploads/xxx.jpg en URL absolue. */
  imageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    return url.startsWith('http') ? url : `${this.apiUrl}${url}`;
  }
}

/** Texte blanc sur une couleur foncée, texte sombre sur une couleur claire (lisibilité des boutons). */
export function textColorOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#13202b' : '#ffffff';
}
