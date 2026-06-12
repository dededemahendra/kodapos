import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { Clock } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { type ShiftSummary, ShiftSummaryPanel } from '~/components/shift/shift-summary-panel';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useActiveCashier } from '~/lib/active-cashier';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/shift/close')({
  component: ShiftClosePage,
});

function ShiftClosePage() {
  const { t } = useLingui();
  const current = useQuery(api.shifts.current, {});
  const summary = useQuery(api.shifts.closeoutSummary, current ? { shiftId: current._id } : 'skip');
  const closeShift = useMutation(api.shifts.close);
  const record = useMutation(api.cashierSessions.record);
  const { cashierId, clearCashier } = useActiveCashier();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closedShift, setClosedShift] = useState<ShiftSummary | null>(null);
  const [countedStr, setCountedStr] = useState('');

  if (closedShift) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold"><Trans>Shift ditutup</Trans></h1>
        <ShiftSummaryPanel shift={closedShift} />
        <div className="flex gap-2">
          <Button onClick={() => window.print()}><Trans>Cetak ringkasan</Trans></Button>
          <Button variant="outline" asChild>
            <Link to="/menu"><Trans>Kembali ke menu</Trans></Link>
          </Button>
        </div>
      </main>
    );
  }

  if (current === undefined) {
    return <p className="text-muted-foreground p-6"><Trans>Memuat…</Trans></p>;
  }

  if (current === null) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock />
            </EmptyMedia>
            <EmptyTitle><Trans>Tidak ada shift terbuka.</Trans></EmptyTitle>
          </EmptyHeader>
          <Button asChild>
            <Link to="/shift/open"><Trans>Buka Shift Baru</Trans></Link>
          </Button>
        </Empty>
      </main>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current) return;
    setSubmitting(true);
    setError(null);
    try {
      if (cashierId) await record({ cashierId, type: 'logout' });
      const counted = Number.parseInt(countedStr, 10);
      await closeShift({ id: current._id, countedCashIDR: counted });
      setClosedShift({
        ...current,
        cashierName: summary?.cashierName ?? '—',
        countedCashIDR: counted,
        closedAt: Date.now(),
        ...(summary ? {
          cashSalesIDR: summary.cashSalesIDR,
          cashInIDR: summary.cashInIDR,
          cashOutIDR: summary.cashOutIDR,
          expectedCashIDR: summary.expectedCashIDR,
          varianceIDR: counted - summary.expectedCashIDR,
        } : {}),
      });
      clearCashier();
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal menutup shift.`);
    } finally {
      setSubmitting(false);
    }
  }

  const panelShift = summary && current ? {
    _id: current._id,
    cashierId: current.cashierId,
    cashierName: summary.cashierName,
    openedAt: current.openedAt,
    openingFloatIDR: summary.openingFloatIDR,
    cashSalesIDR: summary.cashSalesIDR,
    cashInIDR: summary.cashInIDR,
    cashOutIDR: summary.cashOutIDR,
    expectedCashIDR: summary.expectedCashIDR,
  } : null;

  return (
    <main className="max-w-3xl mx-auto p-6 grid grid-cols-2 gap-8">
      <section>
        <h1 className="text-2xl font-bold mb-3"><Trans>Tutup Shift</Trans></h1>
        {panelShift ? <ShiftSummaryPanel shift={panelShift} /> : <Spinner />}
      </section>
      <section>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="countedCashIDR"><Trans>Uang terhitung (Rp)</Trans></FieldLabel>
              <Input
                id="countedCashIDR"
                name="countedCashIDR"
                type="number"
                min="0"
                step="1000"
                required
                value={countedStr}
                onChange={(e) => setCountedStr(e.target.value)}
              />
            </Field>
            {summary && countedStr ? (() => {
              const variance = Number.parseInt(countedStr, 10) - summary.expectedCashIDR;
              return Number.isFinite(variance) ? (
                <p className={`text-sm ${variance === 0 ? 'text-muted-foreground' : variance > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  <Trans>Selisih</Trans>: {variance > 0 ? `+${formatIDR(variance)}` : formatIDR(variance)}
                  {' '}{variance > 0 ? <Trans>(Lebih)</Trans> : variance < 0 ? <Trans>(Kurang)</Trans> : null}
                </p>
              ) : null;
            })() : null}
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menutup…</Trans> : <Trans>Tutup Shift</Trans>}
            </Button>
          </FieldGroup>
        </form>
      </section>
    </main>
  );
}
