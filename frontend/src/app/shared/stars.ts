import { Component, computed, input, model, signal } from '@angular/core';

const STAR = 'M12 2.8l2.8 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 2.9 1.1-6.3L2.9 9.4l6.3-.9L12 2.8Z';
const LABELS = ['', 'Décevant', 'Moyen', 'Bien', 'Très bien', 'Excellent'];

/** Étoiles en lecture seule (remplissage partiel : 4,5 = quatre étoiles et demie). */
@Component({
  selector: 'app-stars',
  standalone: true,
  template: `
    <span class="stars" [style.--star-size.px]="size()" role="img" [attr.aria-label]="'Note : ' + label() + ' sur 5'">
      @for (f of fills(); track $index) {
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path class="star-bg" [attr.d]="d" />
          <path class="star-fg" [attr.d]="d" [style.clip-path]="'inset(0 ' + (100 - f) + '% 0 0)'" />
        </svg>
      }
    </span>`,
})
export class Stars {
  value = input(0);
  size = input(16);
  d = STAR;
  fills = computed(() => [0, 1, 2, 3, 4].map((i) => Math.round(Math.max(0, Math.min(1, this.value() - i)) * 100)));
  label = computed(() => String(Math.round(this.value() * 10) / 10).replace('.', ','));
}

/** Choix d'une note de 1 à 5 (clavier : flèches gauche / droite). */
@Component({
  selector: 'app-star-input',
  standalone: true,
  template: `
    <div class="star-input" role="radiogroup" aria-label="Votre note" (mouseleave)="hover.set(0)">
      @for (n of [1, 2, 3, 4, 5]; track n) {
        <button type="button" role="radio" [attr.aria-checked]="value() === n" [attr.aria-label]="n + ' sur 5 : ' + labels[n]"
          [class.on]="n <= (hover() || value())" [attr.tabindex]="(value() || 1) === n ? 0 : -1"
          (mouseenter)="hover.set(n)" (click)="value.set(n)" (keydown)="key($event)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="d" /></svg>
        </button>
      }
      <span class="star-input-label" aria-live="polite">{{ labels[hover() || value()] }}</span>
    </div>`,
})
export class StarInput {
  value = model(0);
  hover = signal(0);
  d = STAR;
  labels = LABELS;
  key(e: KeyboardEvent) {
    const v = this.value() || 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); this.value.set(Math.min(5, v + 1)); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); this.value.set(Math.max(1, v - 1)); }
    const host = (e.target as HTMLElement).parentElement;
    queueMicrotask(() => (host?.querySelectorAll('button')[this.value() - 1] as HTMLElement | undefined)?.focus());
  }
}
