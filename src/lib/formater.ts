import { i18n } from '@lingui/core';

type DateFormat = 'day-month' | 'full';

function activeLocale(): string {
  return i18n.locale || 'id';
}

export function formatDate(value: string, format: DateFormat = 'day-month'): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const opts: Intl.DateTimeFormatOptions =
    format === 'full'
      ? { day: 'numeric', month: 'short', year: 'numeric' }
      : { day: 'numeric', month: 'short' };
  return new Intl.DateTimeFormat(activeLocale(), opts).format(d);
}

// IDR is always formatted in id-ID locale so the Rp symbol is always shown,
// regardless of the active UI locale (English uses "IDR" which is wrong for POS).
const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function formatIDR(amount: number): string {
  return IDR.format(amount);
}

export function formatIDRCompact(amount: number): string {
  if (amount >= 1_000_000)
    return `Rp${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (amount >= 1_000)
    return `Rp${Math.round(amount / 1_000).toLocaleString('id-ID')} rb`;
  return formatIDR(amount);
}
