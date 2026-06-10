import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { PinGate } from '~/components/staff/pin-gate';
import { ShiftOrderList } from '~/components/shift/shift-order-list';
import { ShiftGate } from '~/components/shift/shift-gate';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos/history')({
  component: HistoryPage,
});

function HistoryPage() {
  return (
    <PinGate>
      <ShiftGate>
        <HistoryList />
      </ShiftGate>
    </PinGate>
  );
}

function HistoryList() {
  const shift = useQuery(api.shifts.current, {});

  if (shift === undefined) {
    return (
      <div className="p-6 flex gap-2 text-muted-foreground items-center">
        <Spinner /><span><Trans>Memuat riwayat…</Trans></span>
      </div>
    );
  }

  return (
    <main className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold"><Trans>Riwayat shift ini</Trans></h1>
        <Link to="/sale" className="text-sm underline text-primary">
          <Trans>Kembali ke /sale</Trans>
        </Link>
      </div>
      {shift ? <ShiftOrderList shiftId={shift._id} /> : null}
    </main>
  );
}
