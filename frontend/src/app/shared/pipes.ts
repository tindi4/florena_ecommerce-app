import { Pipe, PipeTransform, inject } from '@angular/core';
import { ConfigService } from '../core/config.service';
import { Attributes, OrderStatus, STATUS_LABELS } from '../core/models';
import { attributesLabel } from '../core/utils';

@Pipe({ name: 'money', standalone: true, pure: false })
export class MoneyPipe implements PipeTransform {
  private cfg = inject(ConfigService);
  transform(v: number | null | undefined, currency?: string): string {
    if (v == null) return '';
    const cur = currency || this.cfg.currency();
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: cur }).format(v); }
    catch { return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(v)} ${cur}`; }   // devise hors norme ISO : milliers groupés, sans décimales inutiles
  }
}

@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  transform(s: OrderStatus | string): string { return STATUS_LABELS[s as OrderStatus] ?? s; }
}

@Pipe({ name: 'attrs', standalone: true })
export class AttrsPipe implements PipeTransform {
  transform(a: Attributes | null | undefined): string { return attributesLabel(a); }
}

@Pipe({ name: 'img', standalone: true })
export class ImgPipe implements PipeTransform {
  private cfg = inject(ConfigService);
  transform(url: string | null | undefined): string | null { return this.cfg.imageUrl(url); }
}
