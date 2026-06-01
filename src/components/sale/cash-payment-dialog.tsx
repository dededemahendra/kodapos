import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import type { CartState } from './cart-reducer';

function genUUID(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function computeDenominations(total: number): number[] {
  const nextFive = Math.ceil(total / 5000) * 5000;
  const nextHundred = Math.max(100000, Math.ceil(total / 100000) * 100000);
  const out: number[] = [total];
  if (nextFive !== total) out.push(nextFive);
  if (!out.includes(nextHundred)) out.push(nextHundred);
  const fourth = nextHundred + 100000;
  if (!out.includes(fourth)) out.push(fourth);
  return out.slice(0, 4);
}

export function CashPaymentDialog({
  open,
  onOpenChange,
  totalIDR,
  cart,
  shiftId,
  cashierId,
  promoId,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  totalIDR: number;
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  promoId?: Id<'promotions'>;
  onPaid: (orderId: Id<'orders'>) => void;
}) {
  const { t } = useLingui();
  const createCashSale = useMutation(api.orders.createCashSale);
  const [tendered, setTendered] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientIdRef = useRef<string>('');

  // Generate clientId once when the dialog opens; reset on close.
  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setTendered('');
      setError(null);
    }
  }, [open]);

  const tenderedNum = useMemo(() => {
    if (!tendered) return 0;
    const n = Number.parseInt(tendered, 10);
    return Number.isFinite(n) ? n : 0;
  }, [tendered]);
  const changeNum = tenderedNum - totalIDR;
  const denoms = computeDenominations(totalIDR);

  async function confirm() {
    if (tenderedNum < totalIDR || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createCashSale({
        clientId: clientIdRef.current,
        shiftId,
        cashierId,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifierOptionIds: l.modifierOptionIds,
        })),
        cashTenderedIDR: tenderedNum,
        ...(promoId ? { promoId } : {}),
        createdAtClient: Date.now(),
      });
      onPaid(result.orderId);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal memproses pembayaran.`);
    } finally {
      setSubmitting(false);
    }
  }

  function pressKey(key: string) {
    if (key === '⌫') {
      setTendered((s) => s.slice(0, -1));
    } else {
      setTendered((s) => (s + key).slice(0, 12));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pembayaran Tunai</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted px-3 py-2 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <Trans>Total tagihan</Trans>
            </div>
            <div className="text-2xl font-semibold text-primary tabular-nums">
              {formatIDR(totalIDR)}
            </div>
          </div>

          <div
            className={`rounded-md border-2 px-3 py-2 text-right font-mono text-2xl tabular-nums ${
              tenderedNum >= totalIDR && tenderedNum > 0
                ? 'border-ring bg-accent text-primary'
                : 'border-border text-foreground'
            }`}
          >
            {tenderedNum > 0 ? tenderedNum.toLocaleString('id-ID') : '0'}
          </div>
          <div className="flex justify-between text-xs px-1">
            <span className="text-muted-foreground">
              <Trans>Kembalian</Trans>
            </span>
            <span className="font-semibold tabular-nums">
              {changeNum >= 0 ? formatIDR(changeNum) : '—'}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-1.5">
            {denoms.map((d, i) => (
              <button
                type="button"
                key={`${d}-${i}`}
                onClick={() => setTendered(String(d))}
                className="text-xs px-2 py-2 rounded-md border border-border bg-background hover:bg-muted"
              >
                {d === totalIDR ? <Trans>Pas</Trans> : `${(d / 1000).toLocaleString('id-ID')}k`}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '000', '⌫'].map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => pressKey(k)}
                className="text-base px-2 py-3 rounded-md border border-border bg-background hover:bg-muted font-medium"
              >
                {k}
              </button>
            ))}
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button
            type="button"
            onClick={confirm}
            disabled={tenderedNum < totalIDR || submitting}
            className="w-full"
            size="lg"
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? <Trans>Memproses…</Trans> : <Trans>Konfirmasi</Trans>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
