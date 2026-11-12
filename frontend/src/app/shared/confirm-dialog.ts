import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-confirm',
  standalone: true,
  template: `
    <div class="modal-backdrop" (click)="cancel.emit()">
      <div class="modal" role="alertdialog" aria-modal="true" [attr.aria-label]="title()" (click)="$event.stopPropagation()">
        <h2>{{ title() }}</h2>
        <p>{{ message() }}</p>
        <div class="row end gap">
          <button type="button" class="btn ghost" (click)="cancel.emit()">Retour</button>
          <button type="button" class="btn" [class.danger]="danger()" (click)="confirm.emit()">{{ confirmLabel() }}</button>
        </div>
      </div>
    </div>`,
})
export class ConfirmDialog {
  title = input.required<string>();
  message = input.required<string>();
  confirmLabel = input('Confirmer');
  danger = input(false);
  confirm = output<void>();
  cancel = output<void>();
}
