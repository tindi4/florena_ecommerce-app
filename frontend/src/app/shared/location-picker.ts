import { Component, ElementRef, OnDestroy, inject, output, signal, viewChild } from '@angular/core';
import { ConfigService } from '../core/config.service';
import { GoogleMapsService } from '../core/google-maps.service';

export interface PickedLocation { latitude: number; longitude: number; label: string; }

/**
 * Choix de la localisation du client.
 * - Sans clé Google : bouton « Utiliser ma position » (géolocalisation du navigateur) + lien Google Maps.
 * - Avec clé Google : recherche d'adresse, carte, marqueur déplaçable, adresse retrouvée automatiquement.
 */
@Component({
  selector: 'app-location-picker',
  standalone: true,
  template: `
    <div class="locpick">
      <div class="row gap wrap">
        <button type="button" class="btn ghost sm" (click)="useMyPosition()" [disabled]="busy()">📍 Utiliser ma position</button>
        @if (maps.enabled) {
          <input class="input" style="flex:1;min-width:200px" type="search" placeholder="Rechercher une adresse ou un quartier" #q
            (keydown.enter)="$event.preventDefault(); search(q.value)" aria-label="Rechercher sur la carte" />
          <button type="button" class="btn sm" (click)="search(q.value)" [disabled]="busy()">Rechercher</button>
        }
      </div>
      @if (maps.enabled) { <div #mapEl class="locmap" [class.hidden]="!mapReady()" role="application" aria-label="Carte pour choisir votre position"></div> }
      @if (message()) { <p class="hint" role="status">{{ message() }}</p> }
      @if (picked(); as p) {
        <div class="notice ok small">
          <strong>Position choisie :</strong> {{ p.label }}<br />
          <a [href]="'https://www.google.com/maps?q=' + p.latitude + ',' + p.longitude" target="_blank" rel="noopener">Voir sur Google Maps</a> ·
          <button type="button" class="link-btn" (click)="clear()">Retirer</button>
        </div>
      }
      @if (maps.enabled && mapReady()) { <p class="hint">Astuce : touchez la carte ou déplacez le repère pour ajuster la position.</p> }
    </div>`,
})
export class LocationPicker implements OnDestroy {
  maps = inject(GoogleMapsService);
  private cfg = inject(ConfigService);
  private mapEl = viewChild<ElementRef<HTMLDivElement>>('mapEl');
  changed = output<PickedLocation | null>();

  picked = signal<PickedLocation | null>(null);
  busy = signal(false);
  mapReady = signal(false);
  message = signal('');
  private map: any; private marker: any; private google: any; private Geocoder: any;

  ngOnDestroy() { this.map = null; }

  private async ensureMap(center?: { lat: number; lng: number }) {
    if (!this.maps.enabled) return;
    try {
      if (!this.google) {
        this.google = await this.maps.load();
        // Chargement modulaire recommandé par Google (importLibrary).
        const { Map } = await this.google.maps.importLibrary('maps');
        const { Marker } = await this.google.maps.importLibrary('marker');
        const { Geocoder } = await this.google.maps.importLibrary('geocoding');
        this.Geocoder = Geocoder; (this as any).MapClass = Map; (this as any).MarkerClass = Marker;
      }
      // Le conteneur doit être visible AVANT la création de la carte (sinon elle garde une taille nulle).
      if (!this.map) { this.mapReady.set(true); await new Promise((r) => setTimeout(r, 80)); }
      const el = this.mapEl()?.nativeElement;
      if (!el) return;
      const start = center ?? this.cfg.defaultMapCenter;
      if (!this.map) {
        this.map = new (this as any).MapClass(el, { center: start, zoom: center ? 16 : 12, mapTypeControl: false, streetViewControl: false, fullscreenControl: false });
        this.marker = new (this as any).MarkerClass({ map: this.map, position: start, draggable: true, visible: !!center });
        this.map.addListener('click', (e: any) => this.setPoint(e.latLng.lat(), e.latLng.lng()));
        this.marker.addListener('dragend', (e: any) => this.setPoint(e.latLng.lat(), e.latLng.lng()));
      }
    } catch { this.message.set('La carte Google n\'est pas disponible. Vous pouvez utiliser « Ma position » ou saisir votre adresse.'); }
  }

  async useMyPosition() {
    if (!navigator.geolocation) { this.message.set('La géolocalisation n\'est pas disponible sur cet appareil.'); return; }
    this.busy.set(true); this.message.set('Recherche de votre position…');
    navigator.geolocation.getCurrentPosition(
      async (pos) => { this.message.set(''); await this.setPoint(pos.coords.latitude, pos.coords.longitude, true); this.busy.set(false); },
      () => { this.message.set('Position refusée ou indisponible. Autorisez la localisation ou saisissez votre adresse.'); this.busy.set(false); },
      { enableHighAccuracy: true, timeout: 12000 });
  }

  async search(text: string) {
    const query = text.trim();
    if (!query) return;
    this.busy.set(true); this.message.set('');
    try {
      await this.ensureMap();
      const { results } = await new this.Geocoder().geocode({ address: query, region: 'TG' });
      if (!results?.length) { this.message.set('Adresse introuvable. Essayez un autre nom de quartier.'); }
      else { const l = results[0].geometry.location; await this.setPoint(l.lat(), l.lng(), true, results[0].formatted_address); }
    } catch { this.message.set('Recherche impossible pour le moment.'); }
    this.busy.set(false);
  }

  private async setPoint(lat: number, lng: number, recenter = false, knownLabel?: string) {
    await this.ensureMap({ lat, lng });
    let label = knownLabel ?? `Position GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
    if (this.map) {
      this.marker.setPosition({ lat, lng }); this.marker.setVisible(true);
      if (recenter) { this.map.setCenter({ lat, lng }); this.map.setZoom(16); }
      if (!knownLabel) {
        try { const { results } = await new this.Geocoder().geocode({ location: { lat, lng } }); if (results?.[0]) label = results[0].formatted_address; } catch { /* garde les coordonnées */ }
      }
    }
    const p = { latitude: Number(lat.toFixed(6)), longitude: Number(lng.toFixed(6)), label: label.slice(0, 255) };
    this.picked.set(p); this.changed.emit(p);
  }

  clear() { this.picked.set(null); this.changed.emit(null); if (this.marker) this.marker.setVisible(false); }
}
