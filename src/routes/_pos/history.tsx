import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { PinGate } from '~/components/staff/pin-gate';
import { ReceiptPreview } from '~/components/sale/receipt-preview';
import { ShiftGate } from '~/components/shift/shift-gate';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

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
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);
  const orders = useQuery(
    api.orders.listForShift,
    shift ? { shiftId: shift._id } : 'skip'
  );

  if (shift === undefined || orders === undefined) {
    return (
      <div className="p-6 flex gap-2 text-muted-foreground items-center">
        <Spinner />
        <span>Memuat riwayat…</span>
      </div>
    );
  }

  return (
    <main className="p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Riwayat shift ini</h1>
        <Link to="/sale" className="text-sm underline text-primary">
          Kembali ke /sale
        </Link>
      </div>
      {orders.length === 0 ? (
        <p className="text-muted-foreground">Belum ada pesanan di shift ini.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {orders.map((o) => (
            <li key={o._id}>
              <button
                type="button"
                onClick={() => setOpenId(o._id)}
                className="w-full text-left p-3 hover:bg-muted"
              >
                <div className="flex justify-between">
                  <span className="text-sm">
                    {new Date(o.createdAtClient).toLocaleTimeString('id-ID')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatIDR(o.totalIDR)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {o.lines.length} item · {o.paymentMethod === 'cash' ? 'Tunai' : o.paymentMethod}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <ReceiptPreview
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        orderId={openId}
        onDone={() => setOpenId(null)}
      />
    </main>
  );
}
