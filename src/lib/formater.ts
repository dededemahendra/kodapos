import { i18n } from '@lingui/core';
import { getDateFormat, getTimeFormat } from '~/lib/preferences';

type DateFormat = 'day-month' | 'full';

function activeLocale(): string {
  return i18n.locale || 'id';
}

export function formatDate(value: string, format: DateFormat = 'day-month'): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  if (format !== 'full') {
    // 'day-month' — locale-aware short month, no year.
    // Test: formatDate('2026-05-13','day-month') → "Mei" / "May"
    return new Intl.DateTimeFormat(activeLocale(), { day: 'numeric', month: 'short' }).format(d);
  }

  // 'full' — honours the user's date-format preference.
  const pref = getDateFormat();

  if (pref === 'iso') {
    // Zero-pad to YYYY-MM-DD regardless of locale.
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  if (pref === 'dmy-numeric') {
    // DD/MM/YYYY — numeric, zero-padded, locale-independent separator "/".
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  // 'dmy-short' (default) — locale-aware, e.g. "13 Mei 2026" / "13 May 2026".
  return new Intl.DateTimeFormat(activeLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Format a time value using the user's timeFormat preference.
 * '24' → 24-hour clock in the active locale.
 * '12' → 12-hour clock with AM/PM in the active locale.
 */
export function formatTime(value: string | number | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const hour12 = getTimeFormat() === '12';
  return new Intl.DateTimeFormat(activeLocale(), {
    hour: 'numeric',
    minute: '2-digit',
    hour12,
  }).format(d);
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
