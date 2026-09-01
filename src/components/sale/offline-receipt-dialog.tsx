import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { DEFAULT_SERVICE_CHARGE_NAME } from 'convex/lib/pricing';
import type { ReceiptCafe } from 'convex/lib/receipt';
import { useQuery } from 'convex/react';
import { useEffect, useRef } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { formatIDR } from '~/lib/money';
import { offlineReceiptNumber } from '~/lib/offline/receipt-number';
import {
  buildOfflineReceiptOrder,
  changeIDROf,
  type OfflineSaleInput,
} from '~/lib/offline/sale-payload';
import { useBoolPreference, usePreference } from '~/lib/preferences';
import { buildReceiptBytes } from '~/lib/receipt-print';
import { isThermalSupported, printBytes } from '~/lib/thermal-printer';
import { toast } from '~/lib/toast';

/**
 * Receipt for a sale that exists only in this device's outbox.
 *
 * Deliberately a sibling of `ReceiptPreview` rather than a mode of it:
 * `ReceiptPreview` renders `orders.getById`, and there is no order to fetch
 * until the sale replays. Everything here comes from the same cart snapshot
 * that was queued, so the paper and the queued payload always agree.
 *
 * The number is `offlineReceiptNumber` (derived from the clientId), not the
 * order-id scheme the online receipt uses — the document id does not exist
 * yet. Both schemes are searchable in order history.
 */
export function OfflineReceiptDialog({
  open,
  onOpenChange,
  sale,
  cashierName,
  serviceChargeName,
  serviceChargePct,
  taxRatePct,
  priceCategoryName,
  onDone,
  autoPrint = false,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  sale: OfflineSaleInput | null;
  cashierName: string;
  serviceChargeName: string;
  serviceChargePct: number;
  taxRatePct: number;
  priceCategoryName?: string | undefined;
  onDone: () => void;
  autoPrint?: boolean;
}) {
  const { t } = useLingui();
  const cafe = useQuery(api.cafes.myCafe, {});
  const [orderPrefix] = usePreference<string>('orderPrefix', '');
  const [printerMode] = usePreference<string>('printerMode', 'browser');
  const [paperWidth] = usePreference<string>('paperWidth', '80');
  const [printCopies] = usePreference<string>('printCopies', '1');
  const [cashDrawer] = useBoolPreference('cashDrawer', false);
  const autoPrintedRef = useRef<string | null>(null);

  const receipt = sale
    ? buildOfflineReceiptOrder(sale, {
        cashierName,
        serviceChargeName,
        serviceChargePct,
        taxRatePct,
        ...(priceCategoryName !== undefined ? { priceCategoryName } : {}),
      })
    : null;
  const receiptNumber = sale ? offlineReceiptNumber(orderPrefix, sale.clientId) : '';
  const changeIDR = sale ? changeIDROf(sale) : 0;

  async function printThermalCopies(): Promise<void> {
    if (!receipt) return;
    const bytes = buildReceiptBytes(receipt, (cafe ?? null) as unknown as ReceiptCafe | null, {
      widthChars: paperWidth === '58' ? 32 : 48,
      orderNumber: receiptNumber,
      offline: true,
      drawerKick: cashDrawer,
    });
    const copies = Math.max(1, Math.min(5, Number(printCopies) || 1));
    for (let i = 0; i < copies; i++) await printBytes(bytes);
  }

  async function handlePrint(): Promise<void> {
    if (!receipt) return;
    if (printerMode === 'thermal' && isThermalSupported()) {
      try {
        await printThermalCopies();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t`Gagal mencetak.`);
      }
      return;
    }
    window.print();
  }

  // Auto-print a queued sale's receipt, mirroring ReceiptPreview: thermal only,
  // once per sale, guarded by the clientId so a re-render never reprints.
  // biome-ignore lint/correctness/useExhaustiveDependencies: printThermalCopies is re-created every render; the autoPrintedRef guard is what makes this fire once
  useEffect(() => {
    if (!autoPrint || !open || !sale) return;
    if (printerMode !== 'thermal' || !isThermalSupported()) return;
    if (autoPrintedRef.current === sale.clientId) return;
    autoPrintedRef.current = sale.clientId;
    void printThermalCopies().catch((err) =>
      toast.error(err instanceof Error ? err.message : t`Gagal mencetak.`)
    );
  }, [autoPrint, open, sale, printerMode]);

  if (!sale || !receipt) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <Trans>Tersimpan di perangkat</Trans>
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          <Trans>
            Penjualan ini belum terkirim ke server. Struk sudah sah untuk pelanggan, dan penjualan
            akan otomatis dikirim saat koneksi kembali.
          </Trans>
        </p>
        <div data-print-receipt className="font-mono text-sm">
          <div className="text-center mb-3">
            <div className="font-semibold">{cafe?.name}</div>
            <div className="text-xs text-muted-foreground">
              {new Date(receipt.createdAtClient).toLocaleString('id-ID')}
            </div>
            <div className="text-xs text-muted-foreground">
              <Trans>Kasir: {receipt.cashierName}</Trans>
            </div>
            {/* Printed receipt is always English, kept out of the i18n catalog. */}
            <div className="text-xs text-muted-foreground">Order #{receiptNumber}</div>
            {receipt.priceCategoryName ? (
              <div className="text-xs text-muted-foreground">
                Price tier: {receipt.priceCategoryName}
              </div>
            ) : null}
            <div className="mt-1">
              {/* Printed receipt is always English, kept out of the i18n catalog. */}
              <Badge variant="secondary">OFFLINE (PENDING SYNC)</Badge>
            </div>
          </div>
          <hr className="border-dashed border-border my-2" />
          {receipt.lines.map((line, i) => (
            <div key={`${sale.clientId}-line-${i}`} className="mb-1.5">
              <div className="flex justify-between">
                <span>
                  {line.qty}× {line.nameSnapshot}
                  {line.variantName ? ` (${line.variantName})` : ''}
                </span>
                <span className="tabular-nums">{formatIDR(line.lineTotalIDR)}</span>
              </div>
              {line.modifiersSnapshot.length > 0 ? (
                <ul className="text-xs text-muted-foreground ml-3">
                  {line.modifiersSnapshot.map((m, j) => (
                    <li key={`${sale.clientId}-line-${i}-mod-${j}`}>
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
            <span>
              <Trans>Subtotal</Trans>
            </span>
            <span className="tabular-nums">{formatIDR(receipt.subtotalIDR)}</span>
          </div>
          {receipt.discountIDR > 0 ? (
            <div className="flex justify-between">
              <span>
                <Trans>Diskon</Trans>
              </span>
              <span className="tabular-nums">−{formatIDR(receipt.discountIDR)}</span>
            </div>
          ) : null}
          {(receipt.serviceChargeIDR ?? 0) > 0 ? (
            <div className="flex justify-between">
              <span>
                {receipt.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME}{' '}
                {receipt.serviceChargePct ?? 0}%
              </span>
              <span className="tabular-nums">{formatIDR(receipt.serviceChargeIDR ?? 0)}</span>
            </div>
          ) : null}
          {receipt.taxIDR > 0 ? (
            <div className="flex justify-between">
              <span>
                <Trans>PPN {receipt.taxRatePct}%</Trans>
              </span>
              <span className="tabular-nums">{formatIDR(receipt.taxIDR)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-base">
            <span>
              <Trans>Total</Trans>
            </span>
            <span className="tabular-nums">{formatIDR(receipt.totalIDR)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>
              <Trans>Tunai</Trans>
            </span>
            <span className="tabular-nums">{formatIDR(sale.cashTenderedIDR)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              <Trans>Kembalian</Trans>
            </span>
            <span className="tabular-nums">{formatIDR(changeIDR)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 justify-end mt-4">
          <Button type="button" variant="outline" onClick={() => void handlePrint()}>
            <Trans>Cetak</Trans>
          </Button>
          <Button type="button" onClick={onDone}>
            <Trans>Selesai</Trans>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
