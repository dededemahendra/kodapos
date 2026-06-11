import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { History } from 'lucide-react';
import { useState } from 'react';
import { PinGate } from '~/components/staff/pin-gate';
import { ShiftOrderList } from '~/components/shift/shift-order-list';
import { Button } from '~/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/shifts')({
  component: () => (
    <PinGate>
      <ShiftHistoryPage />
    </PinGate>
  ),
});

function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

function ShiftHistoryPage() {
  const { t } = useLingui();
  const open = useQuery(api.shifts.current, {});
  const { results, status, loadMore } = usePaginatedQuery(
    api.shifts.listClosed,
    {},
    { initialNumItems: 20 }
  );
  const [selected, setSelected] = useState<Id<'shifts'> | null>(null);
  const sessions = useQuery(api.cashierSessions.listForShift, selected ? { shiftId: selected } : 'skip');

  if (selected) {
    return (
      <main className="p-6 space-y-3">
        <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
          <Trans>← Kembali ke daftar shift</Trans>
        </Button>
        {sessions && sessions.length > 0 ? (
          <div className="rounded-md border border-border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2"><Trans>Riwayat kasir</Trans></div>
            <ul className="text-sm space-y-1">
              {sessions.map((s) => (
                <li key={s._id} className="flex justify-between">
                  <span>{s.cashierName} · {s.type === 'login' ? <Trans>Masuk</Trans> : s.type === 'switch' ? <Trans>Ganti</Trans> : <Trans>Keluar</Trans>}</span>
                  <span className="text-muted-foreground tabular-nums">{new Date(s.at).toLocaleTimeString('id-ID')}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ShiftOrderList shiftId={selected} />
      </main>
    );
  }

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-bold"><Trans>Riwayat Shift</Trans></h1>

      {open ? (
        <div className="rounded-md border border-border p-3 bg-muted/40">
          <div className="flex justify-between">
            <span className="text-sm font-medium"><Trans>Sedang berjalan</Trans></span>
            <span className="text-xs text-muted-foreground">
              {new Date(open.openedAt).toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      ) : null}

      {status === 'LoadingFirstPage' ? (
        <div className="flex gap-2 text-muted-foreground items-center">
          <Spinner /><span><Trans>Memuat…</Trans></span>
        </div>
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><History /></EmptyMedia>
            <EmptyTitle><Trans>Belum ada shift yang ditutup.</Trans></EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {results.map((s) => (
            <li key={s._id}>
              <button type="button" onClick={() => setSelected(s._id)} className="w-full text-left p-3 hover:bg-muted">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{s.cashierName}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatIDR(s.salesTotalIDR)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.openedAt).toLocaleString('id-ID')} → {new Date(s.closedAt).toLocaleTimeString('id-ID')}
                  {' · '}{formatDuration(s.closedAt - s.openedAt)}
                  {' · '}{t`${s.ordersCount} pesanan`}
                </div>
                <div className="text-xs mt-1 flex gap-3">
                  <span className="text-muted-foreground"><Trans>Kas dihitung</Trans>: {s.countedCashIDR !== null ? formatIDR(s.countedCashIDR) : '—'}</span>
                  {s.varianceIDR !== null ? (
                    <span className={s.varianceIDR === 0 ? 'text-muted-foreground' : s.varianceIDR > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      <Trans>Selisih</Trans>: {s.varianceIDR > 0 ? `+${formatIDR(s.varianceIDR)}` : formatIDR(s.varianceIDR)}
                      {' '}{s.varianceIDR > 0 ? <Trans>(Lebih)</Trans> : s.varianceIDR < 0 ? <Trans>(Kurang)</Trans> : null}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {status === 'CanLoadMore' ? (
        <Button variant="outline" size="sm" onClick={() => loadMore(20)}>
          <Trans>Muat lebih banyak</Trans>
        </Button>
      ) : null}
    </main>
  );
}
