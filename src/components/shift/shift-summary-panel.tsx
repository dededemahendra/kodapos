import { Trans } from '@lingui/react/macro';
import type { Id } from 'convex/_generated/dataModel';
import { formatIDR } from '~/lib/money';

export interface ShiftSummary {
  _id: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  cashierName: string;
  openedAt: number;
  closedAt?: number;
  openingFloatIDR: number;
  cashSalesIDR?: number;
  cashInIDR?: number;
  cashOutIDR?: number;
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
      <dt className="text-muted-foreground"><Trans>Dibuka oleh</Trans></dt>
      <dd>{shift.cashierName}</dd>
      <dt className="text-muted-foreground"><Trans>Dibuka pada</Trans></dt>
      <dd>{opened}</dd>
      {closed && (
        <>
          <dt className="text-muted-foreground"><Trans>Ditutup pada</Trans></dt>
          <dd>{closed}</dd>
        </>
      )}
      <dt className="text-muted-foreground"><Trans>Modal awal</Trans></dt>
      <dd>{formatIDR(shift.openingFloatIDR)}</dd>
      {shift.cashSalesIDR !== undefined && (<><dt className="text-muted-foreground"><Trans>Penjualan tunai</Trans></dt><dd>{formatIDR(shift.cashSalesIDR)}</dd></>)}
      {shift.cashInIDR !== undefined && shift.cashInIDR > 0 && (<><dt className="text-muted-foreground"><Trans>Kas masuk</Trans></dt><dd>+{formatIDR(shift.cashInIDR)}</dd></>)}
      {shift.cashOutIDR !== undefined && shift.cashOutIDR > 0 && (<><dt className="text-muted-foreground"><Trans>Kas keluar</Trans></dt><dd>−{formatIDR(shift.cashOutIDR)}</dd></>)}
      {shift.expectedCashIDR !== undefined && (
        <>
          <dt className="text-muted-foreground"><Trans>Uang seharusnya</Trans></dt>
          <dd>{formatIDR(shift.expectedCashIDR)}</dd>
        </>
      )}
      {shift.countedCashIDR !== undefined && (
        <>
          <dt className="text-muted-foreground"><Trans>Uang terhitung</Trans></dt>
          <dd>{formatIDR(shift.countedCashIDR)}</dd>
        </>
      )}
      {shift.varianceIDR !== undefined && (
        <>
          <dt className="text-muted-foreground"><Trans>Selisih</Trans></dt>
          <dd className={shift.varianceIDR < 0 ? 'text-destructive' : ''}>
            {formatIDR(shift.varianceIDR)}
          </dd>
        </>
      )}
    </dl>
  );
}
