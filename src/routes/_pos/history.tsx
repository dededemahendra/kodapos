import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { PinGate } from '~/components/staff/pin-gate';
import { ShiftOrderList } from '~/components/shift/shift-order-list';
import { ShiftGate } from '~/components/shift/shift-gate';
import { ListSkeleton } from '~/components/ui/loading-skeletons';

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
      <main className="p-6 space-y-3">
        <h1 className="text-2xl font-bold"><Trans>Riwayat shift ini</Trans></h1>
        <ListSkeleton rows={5} />
      </main>
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
