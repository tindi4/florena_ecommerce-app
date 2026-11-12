import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AdminNotification, Counters, Paged } from './models';
import { ToastService } from './toast.service';

/**
 * Compteurs (notifications, messages, commandes à traiter), rafraîchis toutes les 20 s.
 * Quand une nouvelle notification arrive : cloche qui s'agite, pastille qui pulse, message à l'écran,
 * compteur dans l'onglet du navigateur et petit son (désactivable).
 */
@Injectable({ providedIn: 'root' })
export class AdminCountersService {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  readonly counters = signal<Counters>({ unreadNotifications: 0, newMessages: 0, todoOrders: 0, unpaidOrders: 0 });
  readonly ringing = signal(false);
  readonly soundEnabled = signal(localStorage.getItem('adm.sound') !== 'off');
  private timer: any = null;
  private previous: number | null = null;
  private baseTitle = document.title;
  private audio: AudioContext | null = null;

  start() {
    if (this.timer) return;
    this.baseTitle = document.title.replace(/^\(\d+\)\s*/, '');
    this.refresh();
    this.timer = setInterval(() => this.refresh(), 20000);
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.previous = null; document.title = this.baseTitle;
  }

  async refresh() {
    let c: Counters;
    try { c = await this.api.get<Counters>('/admin/counters'); } catch { return; /* 401 géré par l'intercepteur */ }
    this.counters.set(c);
    document.title = c.unreadNotifications > 0 ? `(${c.unreadNotifications}) ${this.baseTitle}` : this.baseTitle;
    if (this.previous !== null && c.unreadNotifications > this.previous) this.alert();
    this.previous = c.unreadNotifications;
  }

  private async alert() {
    this.ringing.set(true);
    setTimeout(() => this.ringing.set(false), 6000);
    if (this.soundEnabled()) this.beep();
    let text = '🔔 Nouvelle notification';
    try {
      const r = await this.api.get<Paged<AdminNotification>>('/admin/notifications', { filter: 'unread', limit: 1 });
      if (r.items[0]) text = `🔔 ${r.items[0].title}`;
    } catch { /* texte par défaut */ }
    this.toast.show('info', text, 8000);
  }

  /** Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : appelé au premier clic. */
  unlock() {
    if (!this.audio) { try { this.audio = new AudioContext(); } catch { return; } }
    if (this.audio.state === 'suspended') this.audio.resume();
  }
  toggleSound() {
    this.soundEnabled.update((v) => !v);
    localStorage.setItem('adm.sound', this.soundEnabled() ? 'on' : 'off');
    this.unlock();
    if (this.soundEnabled()) this.beep();
  }
  private beep() {
    const ctx = this.audio; if (!ctx || ctx.state !== 'running') return;
    [[880, 0], [1175, 0.18]].forEach(([freq, delay]) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq;
      const t = ctx.currentTime + delay;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.4);
    });
  }
}
