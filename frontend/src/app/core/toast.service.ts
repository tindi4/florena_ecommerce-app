import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;
  show(kind: Toast['kind'], text: string, ms = 4500) {
    const id = ++this.seq;
    this.toasts.update((t) => [...t, { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }
  success(t: string) { this.show('success', t); }
  error(t: string) { this.show('error', t, 7000); }
  dismiss(id: number) { this.toasts.update((t) => t.filter((x) => x.id !== id)); }
}
