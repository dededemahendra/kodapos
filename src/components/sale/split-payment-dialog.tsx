import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { DEFAULT_LOYALTY } from 'convex/lib/loyalty';
import { useMutation, useQuery } from 'convex/react';
import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
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
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';
import { genUUID } from '~/lib/uuid';
import type { CartState } from './cart-reducer';
import { CustomerSection, type CustomerSelection } from './customer-section';
import { usePaymentTotals } from './use-payment-totals';

type SyncMethod = 'cash' | 'qris_static';
type TenderRow = { method: SyncMethod; amount: string; tendered: string };

function parseAmount(s: string): number {
  if (!s) return 0;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function SplitPaymentDialog({
  open,
  onOpenChange,
  subtotalIDR,
  promoDiscountIDR,
  serviceChargeEnabled,
  serviceChargePct,
  taxEnabled,
  taxRatePct,
  cashEnabled,
  qrisStaticEnabled,
  cart,
  shiftId,
  cashierId,
  promoId,
  tableId,
  onPaid,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subtotalIDR: number;
  /** Promo discount already applied to the cart (0 when no promo). */
  promoDiscountIDR: number;
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
  /** Cash is a usable sync tender method. */
  cashEnabled: boolean;
  /** Static QRIS is a usable sync tender method (enabled + QR configured). */
  qrisStaticEnabled: boolean;
  cart: CartState;
  shiftId: Id<'shifts'>;
  cashierId: Id<'cafeStaff'>;
  promoId?: Id<'promotions'>;
  tableId?: Id<'tables'>;
  onPaid: (orderId: Id<'orders'>) => void;
}) {
  const { t } = useLingui();
  const createSplitSale = useMutation(api.orders.createSplitSale);
  const loyaltyCfg = useQuery(api.loyalty.getConfig) ?? DEFAULT_LOYALTY;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerSelection>({ redeemPoints: 0 });
  const clientIdRef = useRef<string>('');

  const availableMethods = useMemo<SyncMethod[]>(() => {
    const out: SyncMethod[] = [];
    if (cashEnabled) out.push('cash');
    if (qrisStaticEnabled) out.push('qris_static');
    return out;
  }, [cashEnabled, qrisStaticEnabled]);

  const firstMethod: SyncMethod = availableMethods[0] ?? 'cash';
  const [rows, setRows] = useState<TenderRow[]>([
    { method: firstMethod, amount: '', tendered: '' },
  ]);

  // Generate clientId once when the dialog opens; reset state on close.
  useEffect(() => {
    if (open) {
      clientIdRef.current = genUUID();
      setError(null);
      setCustomer({ redeemPoints: 0 });
      setRows([{ method: availableMethods[0] ?? 'cash', amount: '', tendered: '' }]);
    }
  }, [open, availableMethods]);

  const { afterPromoIDR, redeemIDR, totalIDR } = usePaymentTotals({
    subtotalIDR,
    discountIDR: promoDiscountIDR,
    redeemPoints: customer.redeemPoints,
    loyaltyCfg,
    serviceChargeEnabled,
    serviceChargePct,
    taxEnabled,
    taxRatePct,
  });

  const sumAmounts = rows.reduce((s, r) => s + parseAmount(r.amount), 0);
  const remaining = totalIDR - sumAmounts;
  const cashTendersOk = rows.every((r) => {
    if (r.method !== 'cash') return true;
    const amt = parseAmount(r.amount);
    const tendered = r.tendered ? Number.parseInt(r.tendered, 10) : amt;
    return Number.isFinite(tendered) && tendered >= amt;
  });
  const canSubmit = remaining === 0 && cashTendersOk && rows.length >= 2 && !submitting;

  function updateRow(i: number, patch: Partial<TenderRow>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { method: availableMethods[0] ?? 'cash', amount: '', tendered: '' }]);
  }
  function removeRow(i: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  async function confirm() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const tenders = rows.map((r) => {
        const amountIDR = parseAmount(r.amount);
        if (r.method === 'cash') {
          const tenderedIDR = r.tendered ? Number.parseInt(r.tendered, 10) : amountIDR;
          return { method: 'cash' as const, amountIDR, tenderedIDR };
        }
        return { method: 'qris_static' as const, amountIDR };
      });
      const result = await createSplitSale({
        clientId: clientIdRef.current,
        shiftId,
        cashierId,
        orderType: cart.orderType,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          qty: l.qty,
          modifierOptionIds: l.modifierOptionIds,
        })),
        tenders,
        ...(promoId ? { promoId } : {}),
        ...(tableId ? { tableId } : {}),
        ...(cart.manualDiscount ? { manualDiscount: cart.manualDiscount } : {}),
        ...(customer.customerId ? { customerId: customer.customerId } : {}),
        ...(customer.redeemPoints > 0 ? { redeemPoints: customer.redeemPoints } : {}),
        createdAtClient: Date.now(),
      });
      onPaid(result.orderId);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : t`Gagal memproses pembayaran.`;
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Bagi pembayaran</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <CustomerSection
            cafeLoyalty={loyaltyCfg}
            afterPromoIDR={afterPromoIDR}
            value={customer}
            onChange={setCustomer}
          />

          <div className="rounded-md bg-muted px-3 py-2 space-y-1">
            {redeemIDR > 0 ? (
              <div className="flex justify-between text-xs text-emerald-700">
                <span>
                  <Trans>Poin ditukar</Trans>
                </span>
                <span className="tabular-nums">−{formatIDR(redeemIDR)}</span>
              </div>
            ) : null}
            <div className="text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                <Trans>Total tagihan</Trans>
              </div>
              <div className="text-2xl font-semibold text-primary tabular-nums">
                {formatIDR(totalIDR)}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {rows.map((row, i) => {
              const amt = parseAmount(row.amount);
              const tenderedNum = row.tendered ? Number.parseInt(row.tendered, 10) : 0;
              const changeNum = tenderedNum - amt;
              return (
                <div key={i} className="rounded-md border border-border px-2.5 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Select
                      value={row.method}
                      onValueChange={(v) =>
                        updateRow(i, { method: v as SyncMethod, tendered: '' })
                      }
                    >
                      <SelectTrigger className="h-9 flex-1">
                        <SelectValue placeholder={t`Metode`} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableMethods.includes('cash') ? (
                          <SelectItem value="cash">
                            <Trans>Tunai</Trans>
                          </SelectItem>
                        ) : null}
                        {availableMethods.includes('qris_static') ? (
                          <SelectItem value="qris_static">
                            <Trans>QRIS statis</Trans>
                          </SelectItem>
                        ) : null}
                      </SelectContent>
                    </Select>
                    <Input
                      inputMode="numeric"
                      placeholder={t`Jumlah (Rp)`}
                      value={row.amount}
                      onChange={(e) =>
                        updateRow(i, { amount: e.target.value.replace(/\D/g, '') })
                      }
                      className="h-9 w-28 text-right tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      disabled={rows.length <= 1}
                      aria-label={t`Hapus tender`}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                  {row.method === 'cash' ? (
                    <div className="flex items-center gap-2">
                      <Input
                        inputMode="numeric"
                        placeholder={t`Uang diterima`}
                        value={row.tendered}
                        onChange={(e) =>
                          updateRow(i, { tendered: e.target.value.replace(/\D/g, '') })
                        }
                        className="h-9 flex-1 text-right tabular-nums"
                      />
                      <span className="w-28 text-right text-xs">
                        <span className="text-muted-foreground">
                          <Trans>Kembalian</Trans>
                        </span>{' '}
                        <span className="font-semibold tabular-nums">
                          {row.tendered && changeNum >= 0 ? formatIDR(changeNum) : '—'}
                        </span>
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}

            <button
              type="button"
              onClick={addRow}
              className="text-left text-sm text-primary hover:underline"
            >
              + <Trans>Tambah tender</Trans>
            </button>
          </div>

          <div className="flex justify-between text-sm px-1">
            <span className="text-muted-foreground">
              <Trans>Sisa</Trans>
            </span>
            <span
              className={`font-semibold tabular-nums ${remaining === 0 ? 'text-emerald-700' : ''}`}
            >
              {formatIDR(remaining)}
            </span>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <Button
            type="button"
            onClick={confirm}
            disabled={!canSubmit}
            className="w-full"
            size="lg"
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {submitting ? <Trans>Memproses…</Trans> : <Trans>Bayar</Trans>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
