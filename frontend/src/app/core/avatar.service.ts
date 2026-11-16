import { Injectable, signal } from '@angular/core';

const KEY = 'boutique.avatar.v1';

/**
 * Photo de profil du client, gardée sur l'appareil uniquement (jamais envoyée au serveur).
 * Partagée entre « Mon compte » (où on la choisit) et l'en-tête du site (où elle remplace l'icône de connexion).
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  readonly avatar = signal<string | null>(this.read());
  private read(): string | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  set(dataUrl: string) { this.avatar.set(dataUrl); try { localStorage.setItem(KEY, JSON.stringify(dataUrl)); } catch { /* stockage indisponible */ } }
  clear() { this.avatar.set(null); try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
}
