import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Clock } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { type ShiftSummary, ShiftSummaryPanel } from '~/components/shift/shift-summary-panel';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { SummaryRowsSkeleton } from '~/components/ui/loading-skeletons';
import { Spinner } from '~/components/ui/spinner';
import { useActiveCashier } from '~/lib/active-cashier';
import { formatIDR } from '~/lib/money';
import { queuedCashTotalIDR, queuedForShift } from '~/lib/offline/queued-sales';
import { useQueuedSales } from '~/lib/offline/use-queued-sales';

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
  // The server cannot see this device's outbox, so the cash the till took for
  // sales that have not posted yet is invisible to `closeoutSummary`. Left out,
  // every offline sale reads as a drawer overage at close.
  const outbox = useQueuedSales();
  const queuedSales = current ? queuedForShift(outbox.sales, current._id) : [];
  const queuedCashIDR = queuedCashTotalIDR(queuedSales);
  const expectedCashIDR = summary === undefined ? null : summary.expectedCashIDR + queuedCashIDR;
  // Hoisted for the <Trans> below: a message placeholder must be a plain
  // variable, not an expression.
  const queuedCashText = formatIDR(queuedCashIDR);

  if (closedShift) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">
          <Trans>Shift ditutup</Trans>
        </h1>
        <ShiftSummaryPanel shift={closedShift} />
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>
            <Trans>Cetak ringkasan</Trans>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/menu">
              <Trans>Kembali ke menu</Trans>
            </Link>
          </Button>
        </div>
      </main>
    );
  }

  if (current === undefined) {
    return (
      <div className="p-6">
        <SummaryRowsSkeleton rows={6} />
      </div>
    );
  }

  if (current === null) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Tidak ada shift terbuka.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Buka shift baru sebelum menerima penjualan.</Trans>
            </EmptyDescription>
          </EmptyHeader>
          <Button asChild>
            <Link to="/shift/open">
              <Trans>Buka Shift Baru</Trans>
            </Link>
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
      // Declared, not folded into countedCashIDR: the server records it as its
      // own field and drains it as the queued sales actually post, so the
      // Z-report reconciles at close AND after replay. See shiftCashBreakdown.
      await closeShift({
        id: current._id,
        countedCashIDR: counted,
        ...(queuedCashIDR > 0 ? { queuedCashIDR } : {}),
      });
      setClosedShift({
        ...current,
        cashierName: summary?.cashierName ?? '—',
        countedCashIDR: counted,
        closedAt: Date.now(),
        ...(queuedCashIDR > 0 ? { queuedCashIDR } : {}),
        ...(summary && expectedCashIDR !== null
          ? {
              cashSalesIDR: summary.cashSalesIDR,
              cashInIDR: summary.cashInIDR,
              cashOutIDR: summary.cashOutIDR,
              expectedCashIDR,
              varianceIDR: counted - expectedCashIDR,
            }
          : {}),
      });
      clearCashier();
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal menutup shift.`);
    } finally {
      setSubmitting(false);
    }
  }

  const panelShift =
    summary && current && expectedCashIDR !== null
      ? {
          _id: current._id,
          cashierId: current.cashierId,
          cashierName: summary.cashierName,
          openedAt: current.openedAt,
          openingFloatIDR: summary.openingFloatIDR,
          cashSalesIDR: summary.cashSalesIDR,
          cashInIDR: summary.cashInIDR,
          cashOutIDR: summary.cashOutIDR,
          expectedCashIDR,
          ...(queuedCashIDR > 0 ? { queuedCashIDR } : {}),
        }
      : null;

  return (
    <main className="max-w-3xl mx-auto p-6 grid grid-cols-2 gap-8">
      <section>
        <h1 className="text-2xl font-bold mb-3">
          <Trans>Tutup Shift</Trans>
        </h1>
        {queuedSales.length > 0 ? (
          <p
            role="status"
            className="mb-3 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm text-amber-900"
          >
            <span className="font-medium">
              <Trans>Menunggu sinkron</Trans>
            </span>{' '}
            <Plural
              value={queuedSales.length}
              one="# penjualan tunai belum terkirim ke server."
              other="# penjualan tunai belum terkirim ke server."
            />{' '}
            <Trans>
              Uangnya sudah ada di laci, jadi {queuedCashText} sudah ditambahkan ke uang seharusnya
              di bawah.
            </Trans>
          </p>
        ) : null}
        {outbox.error ? (
          <p role="status" className="mb-3 text-sm text-red-600">
            <Trans>
              Antrean offline di perangkat ini tidak bisa dibaca, jadi penjualan yang belum terkirim
              belum tentu terhitung. Tutup tab kodapos lain lalu muat ulang.
            </Trans>
          </p>
        ) : null}
        {panelShift ? <ShiftSummaryPanel shift={panelShift} /> : <SummaryRowsSkeleton rows={6} />}
      </section>
      <section>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="countedCashIDR">
                <Trans>Uang terhitung (Rp)</Trans>
              </FieldLabel>
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
            {expectedCashIDR !== null && countedStr
              ? (() => {
                  const variance = Number.parseInt(countedStr, 10) - expectedCashIDR;
                  return Number.isFinite(variance) ? (
                    <p
                      className={`text-sm ${variance === 0 ? 'text-muted-foreground' : variance > 0 ? 'text-emerald-600' : 'text-red-600'}`}
                    >
                      <Trans>Selisih</Trans>:{' '}
                      {variance > 0 ? `+${formatIDR(variance)}` : formatIDR(variance)}{' '}
                      {variance > 0 ? (
                        <Trans>(Lebih)</Trans>
                      ) : variance < 0 ? (
                        <Trans>(Kurang)</Trans>
                      ) : null}
                    </p>
                  ) : null;
                })()
              : null}
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
