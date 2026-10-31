import { Component, input } from '@angular/core';
import { PaymentStatus, STATUS_LABELS, OrderStatus } from '../core/models';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `<span class="badge" [class]="'badge st-' + status()"><span class="dot" aria-hidden="true"></span>{{ labels[status()] }}</span>`,
})
export class StatusBadge {
  status = input.required<OrderStatus>();
  labels = STATUS_LABELS;
}

@Component({
  selector: 'app-pay-badge',
  standalone: true,
  template: `<span class="badge" [class]="paid() === 'PAYE' ? 'badge pay-yes' : 'badge pay-no'">{{ paid() === 'PAYE' ? 'Payée' : 'Non payée' }}</span>`,
})
export class PayBadge {
  paid = input.required<PaymentStatus>();
}
