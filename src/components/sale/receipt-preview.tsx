import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent } from '~/components/ui/dialog';
import { formatIDR } from '~/lib/money';

export function ReceiptPreview({
  open,
  onOpenChange,
  orderId,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: Id<'orders'> | null;
  onDone: () => void;
}) {
  const cafe = useQuery(api.cafes.myCafe, {});
  const order = useQuery(api.orders.getById, orderId ? { id: orderId } : 'skip');

  if (!orderId) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {order === undefined || cafe === undefined ? (
          <p className="text-fg-muted">Memuat struk…</p>
        ) : !order ? (
          <p className="text-red-600">Pesanan tidak ditemukan.</p>
        ) : (
          <div data-print-receipt className="font-mono text-sm">
            <div className="text-center mb-3">
              <div className="font-semibold">{cafe?.name}</div>
              <div className="text-xs text-fg-muted">
                {new Date(order.createdAtClient).toLocaleString('id-ID')}
              </div>
              <div className="text-xs text-fg-muted">Kasir: {order.cashierName}</div>
            </div>
            <hr className="border-dashed border-border my-2" />
            {order.lines.map((line, i) => (
              <div key={`${order._id}-line-${i}`} className="mb-1.5">
                <div className="flex justify-between">
                  <span>
                    {line.qty}× {line.nameSnapshot}
                  </span>
                  <span className="tabular-nums">{formatIDR(line.lineTotalIDR)}</span>
                </div>
                {line.modifiersSnapshot.length > 0 ? (
                  <ul className="text-xs text-fg-muted ml-3">
                    {line.modifiersSnapshot.map((m, j) => (
                      <li key={`${order._id}-line-${i}-mod-${j}`}>
                        + {m.groupName}: {m.optionName}
                        {m.priceAdjustmentIDR > 0 ? ` (+${formatIDR(m.priceAdjustmentIDR)})` : ''}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
            <hr className="border-dashed border-border my-2" />
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span className="tabular-nums">{formatIDR(order.subtotalIDR)}</span>
            </div>
            {order.taxIDR > 0 ? (
              <div className="flex justify-between">
                <span>PPN {order.taxRatePct}%</span>
                <span className="tabular-nums">{formatIDR(order.taxIDR)}</span>
              </div>
            ) : null}
            <div className="flex justify-between font-semibold text-base">
              <span>Total</span>
              <span className="tabular-nums">{formatIDR(order.totalIDR)}</span>
            </div>
            {order.payment?.method === 'cash' ? (
              <>
                <div className="flex justify-between mt-1">
                  <span>Tunai</span>
                  <span className="tabular-nums">{formatIDR(order.payment.cashTenderedIDR ?? 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Kembalian</span>
                  <span className="tabular-nums">{formatIDR(order.payment.changeIDR ?? 0)}</span>
                </div>
              </>
            ) : null}
          </div>
        )}
        <div className="flex gap-2 justify-end mt-4">
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Cetak
          </Button>
          <Button type="button" onClick={onDone}>
            Selesai
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
