import type { Id } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export interface ShiftSummary {
  _id: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  cashierName: string;
  openedAt: number;
  closedAt?: number;
  openingFloatIDR: number;
  expectedCashIDR?: number;
  countedCashIDR?: number;
  varianceIDR?: number;
}

export interface ShiftSummaryPanelProps {
  shift: ShiftSummary;
}

export function ShiftSummaryPanel({ shift }: ShiftSummaryPanelProps) {
  const opened = new Date(shift.openedAt).toLocaleString('id-ID');
  const closed = shift.closedAt ? new Date(shift.closedAt).toLocaleString('id-ID') : null;
  return (
    <dl className="grid grid-cols-2 gap-y-2 text-sm">
      <dt className="text-fg-muted">Dibuka oleh</dt>
      <dd>{shift.cashierName}</dd>
      <dt className="text-fg-muted">Dibuka pada</dt>
      <dd>{opened}</dd>
      {closed && (
        <>
          <dt className="text-fg-muted">Ditutup pada</dt>
          <dd>{closed}</dd>
        </>
      )}
      <dt className="text-fg-muted">Modal awal</dt>
      <dd>{formatIDR(shift.openingFloatIDR)}</dd>
      {shift.expectedCashIDR !== undefined && (
        <>
          <dt className="text-fg-muted">Uang seharusnya</dt>
          <dd>{formatIDR(shift.expectedCashIDR)}</dd>
        </>
      )}
      {shift.countedCashIDR !== undefined && (
        <>
          <dt className="text-fg-muted">Uang terhitung</dt>
          <dd>{formatIDR(shift.countedCashIDR)}</dd>
        </>
      )}
      {shift.varianceIDR !== undefined && (
        <>
          <dt className="text-fg-muted">Selisih</dt>
          <dd className={shift.varianceIDR < 0 ? 'text-danger' : ''}>
            {formatIDR(shift.varianceIDR)}
          </dd>
        </>
      )}
    </dl>
  );
}
