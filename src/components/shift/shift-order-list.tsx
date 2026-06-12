import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { ReceiptPreview } from '~/components/sale/receipt-preview';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export function ShiftOrderList({ shiftId }: { shiftId: Id<'shifts'> }) {
  const { t } = useLingui();
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);
  const orders = useQuery(api.orders.listForShift, { shiftId });

  if (orders === undefined) {
    return (
      <div className="flex gap-2 text-muted-foreground items-center">
        <Spinner /><span><Trans>Memuat riwayat…</Trans></span>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><Receipt /></EmptyMedia>
          <EmptyTitle><Trans>Belum ada pesanan di shift ini.</Trans></EmptyTitle>
          <EmptyDescription><Trans>Pesanan yang diselesaikan selama shift ini akan muncul di sini.</Trans></EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <ul className="divide-y divide-border border border-border rounded-md">
        {orders.map((o) => (
          <li key={o._id}>
            <button type="button" onClick={() => setOpenId(o._id)} className="w-full text-left p-3 hover:bg-muted">
              <div className="flex justify-between">
                <span className="text-sm">{new Date(o.createdAtClient).toLocaleTimeString('id-ID')}</span>
                <span className="text-sm font-semibold tabular-nums">{formatIDR(o.totalIDR)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {t`${o.lines.length} item`} · {o.paymentMethod === 'cash' ? t`Tunai` : o.paymentMethod}
              </div>
            </button>
          </li>
        ))}
      </ul>
      <ReceiptPreview
        open={openId !== null}
        onOpenChange={(open) => { if (!open) setOpenId(null); }}
        orderId={openId}
        onDone={() => setOpenId(null)}
      />
    </>
  );
}
