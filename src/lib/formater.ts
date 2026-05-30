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

/** Locale-aware relative time, e.g. "2 jam lalu" / "2 hours ago". */
export function formatRelative(value: number | string | Date): string {
  const ms =
    value instanceof Date
      ? value.getTime()
      : typeof value === 'number'
        ? value
        : new Date(value).getTime();
  if (Number.isNaN(ms)) return '';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(activeLocale(), { numeric: 'auto' });
  // Sub-minute reads as "now" / "sekarang" rather than rounding to "this minute".
  if (abs < 60_000) return rtf.format(0, 'second');
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  return rtf.format(Math.round(diff / 86_400_000), 'day');
}

/**
 * Format a calendar-day key ("YYYY-MM-DD") as locale-aware day + short month.
 * Timezone-independent: the key already encodes the intended calendar day, so
 * it renders the same regardless of the viewer's browser timezone.
 */
export function formatDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) return key;
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat(activeLocale(), {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(date);
}

/** Locale-aware integer count with grouping separators, e.g. "1.234" / "1,234". */
export function formatCount(value: number): string {
  return new Intl.NumberFormat(activeLocale()).format(value);
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
