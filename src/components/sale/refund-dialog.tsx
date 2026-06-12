import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { useActiveCashier } from '~/lib/active-cashier';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';
import { genUUID } from '~/lib/uuid';

type RefundMethod = 'cash' | 'qris_static' | 'qris_dynamic' | 'giftcard';

// BI labels for the refund-destination Select (mirrors split-payment-dialog).
const METHOD_LABELS: Record<RefundMethod, React.ReactNode> = {
  cash: <Trans>Tunai</Trans>,
  qris_static: <Trans>QRIS statis</Trans>,
  qris_dynamic: <Trans>QRIS dinamis</Trans>,
  giftcard: <Trans>Kartu hadiah</Trans>,
};

export function RefundDialog({
  orderId,
  open,
  onOpenChange,
  onDone,
}: {
  orderId: Id<'orders'> | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const { t } = useLingui();
  const { cashierId } = useActiveCashier();
  const info = useQuery(api.orders.refundInfo, orderId ? { orderId } : 'skip');
  const createRefund = useMutation(api.refunds.create);

  // Per-line { checked, qty }, keyed by lineIndex. Seeded from info.lines:
  // default unchecked, qty = remainingQty.
  const [rows, setRows] = useState<Record<number, { checked: boolean; qty: number }>>({});
  const [method, setMethod] = useState<RefundMethod>('cash');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Re-seed whenever the dialog opens or the order changes.
  useEffect(() => {
    if (!open || !info) return;
    const seeded: Record<number, { checked: boolean; qty: number }> = {};
    for (const l of info.lines) {
      seeded[l.lineIndex] = { checked: false, qty: l.remainingQty };
    }
    setRows(seeded);
    setMethod(info.methods[0] ?? 'cash');
    setReason('');
  }, [open, info]);

  const total = useMemo(() => {
    if (!info) return 0;
    return info.lines.reduce((sum, l) => {
      const row = rows[l.lineIndex];
      if (!row?.checked || row.qty <= 0) return sum;
      return sum + l.unitRefundIDR * row.qty;
    }, 0);
  }, [info, rows]);

  // True when every line with remaining qty is checked and selected in full —
  // the server uses the exact remainder, so flag it as "Seluruh sisa".
  const allRemainingSelected = useMemo(() => {
    if (!info) return false;
    const refundable = info.lines.filter((l) => l.remainingQty > 0);
    if (refundable.length === 0) return false;
    return refundable.every((l) => {
      const row = rows[l.lineIndex];
      return row?.checked && row.qty === l.remainingQty;
    });
  }, [info, rows]);

  const hasSelection = info
    ? info.lines.some((l) => {
        const row = rows[l.lineIndex];
        return row?.checked && row.qty > 0;
      })
    : false;

  async function submit() {
    if (!orderId || !cashierId || !info || !hasSelection || submitting) return;
    setSubmitting(true);
    try {
      const lines: { lineIndex: number; qty: number }[] = [];
      for (const l of info.lines) {
        const row = rows[l.lineIndex];
        if (row?.checked && row.qty > 0) {
          lines.push({ lineIndex: l.lineIndex, qty: row.qty });
        }
      }
      await createRefund({
        orderId,
        clientId: genUUID(),
        cashierId,
        method,
        lines,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      toast.success(t`Pesanan direfund.`);
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal refund.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            <Trans>Refund pesanan</Trans>
          </DialogTitle>
        </DialogHeader>
        {info === undefined ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2">
              {info.lines.map((l) => {
                const row = rows[l.lineIndex];
                const sudah = l.remainingQty === 0;
                return (
                  <li
                    key={l.lineIndex}
                    className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                  >
                    <Checkbox
                      checked={row?.checked ?? false}
                      disabled={sudah}
                      onCheckedChange={(c) =>
                        setRows((prev) => ({
                          ...prev,
                          [l.lineIndex]: {
                            checked: c === true,
                            qty: prev[l.lineIndex]?.qty ?? l.remainingQty,
                          },
                        }))
                      }
                      aria-label={l.nameSnapshot}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{l.nameSnapshot}</div>
                      {sudah ? (
                        <div className="text-xs text-muted-foreground">
                          <Trans>Sudah direfund</Trans>
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {formatIDR(l.unitRefundIDR)} ·{' '}
                          <Trans>sisa {l.remainingQty}</Trans>
                        </div>
                      )}
                    </div>
                    {!sudah ? (
                      <Input
                        type="number"
                        min={1}
                        max={l.remainingQty}
                        value={row?.qty ?? l.remainingQty}
                        disabled={!(row?.checked ?? false)}
                        onChange={(e) => {
                          const raw = Number.parseInt(e.target.value, 10);
                          const clamped = Number.isFinite(raw)
                            ? Math.max(1, Math.min(l.remainingQty, raw))
                            : 1;
                          setRows((prev) => ({
                            ...prev,
                            [l.lineIndex]: {
                              checked: prev[l.lineIndex]?.checked ?? false,
                              qty: clamped,
                            },
                          }));
                        }}
                        className="w-16 tabular-nums"
                        aria-label={t`Jumlah`}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>

            <div className="space-y-1">
              <span className="text-sm text-muted-foreground">
                <Trans>Refund ke</Trans>
              </span>
              <Select value={method} onValueChange={(v) => setMethod(v as RefundMethod)}>
                <SelectTrigger>
                  <SelectValue placeholder={t`Metode`} />
                </SelectTrigger>
                <SelectContent>
                  {info.methods.map((m) => (
                    <SelectItem key={m} value={m}>
                      {METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={120}
              placeholder={t`Alasan (opsional)`}
              aria-label="reason"
            />

            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                <Trans>Jumlah refund</Trans>
              </span>
              <span className="font-semibold tabular-nums">
                {formatIDR(total)}
                {allRemainingSelected ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    <Trans>Seluruh sisa</Trans>
                  </span>
                ) : null}
              </span>
            </div>

            <Button
              type="button"
              onClick={submit}
              disabled={!hasSelection || submitting}
              className="w-full"
            >
              {submitting ? <Spinner data-icon="inline-start" /> : null}
              <Trans>Refund {formatIDR(total)}</Trans>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
