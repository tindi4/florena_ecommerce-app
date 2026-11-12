import { Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-toasts',
  standalone: true,
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class]="'toast t-' + t.kind">
          <span>{{ t.text }}</span>
          <button type="button" class="toast-x" (click)="toast.dismiss(t.id)" aria-label="Fermer">×</button>
        </div>
      }
    </div>`,
})
export class Toasts { toast = inject(ToastService); }
