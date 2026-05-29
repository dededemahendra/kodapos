// Small formatting helpers for the dashboard. Indonesian locale, IDR currency.
// (Replaces the @efferd/formater registry dependency.)

const ID_MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

type DateFormat = 'day-month' | 'full';

/** Format an ISO date string (e.g. "2026-04-13"). */
export function formatDate(value: string, format: DateFormat = 'day-month'): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = d.getDate();
  const month = ID_MONTHS_SHORT[d.getMonth()];
  if (format === 'full') return `${day} ${month} ${d.getFullYear()}`;
  return `${day} ${month}`;
}

const IDR = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

/** Format a rupiah amount (integer IDR) as "Rp1.234.567". */
export function formatIDR(amount: number): string {
  return IDR.format(amount);
}

/** Compact rupiah for tight spaces, e.g. "Rp1,2 jt" / "Rp450 rb". */
export function formatIDRCompact(amount: number): string {
  if (amount >= 1_000_000) return `Rp${(amount / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  if (amount >= 1_000) return `Rp${Math.round(amount / 1_000).toLocaleString('id-ID')} rb`;
  return formatIDR(amount);
}
