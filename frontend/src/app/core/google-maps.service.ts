import { Injectable, inject } from '@angular/core';
import { ConfigService } from './config.service';

/** Charge l'API Google Maps JavaScript à la demande (uniquement si une clé est configurée dans config.json). */
@Injectable({ providedIn: 'root' })
export class GoogleMapsService {
  private cfg = inject(ConfigService);
  private loading?: Promise<any>;

  get enabled(): boolean { return !!this.cfg.googleMapsApiKey; }

  load(): Promise<any> {
    const w = window as any;
    if (!this.enabled) return Promise.reject(new Error('Clé Google Maps absente'));
    if (w.google?.maps) return Promise.resolve(w.google);
    this.loading ??= new Promise((resolve, reject) => {
      w.__gmapsReady = () => resolve(w.google);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(this.cfg.googleMapsApiKey)}&callback=__gmapsReady&loading=async&language=fr&v=weekly`;
      s.async = true;
      s.onerror = () => { this.loading = undefined; reject(new Error('Chargement Google Maps impossible')); };
      document.head.appendChild(s);
    });
    return this.loading;
  }
}
