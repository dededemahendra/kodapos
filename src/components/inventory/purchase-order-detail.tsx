import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Input } from '~/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Spinner } from '~/components/ui/spinner';
import { StatusBadge } from '~/components/ui/status-badge';
import type { StatusBadgeVariant } from '~/components/ui/status-badge-variant';
import { formatIDR } from '~/lib/money';
import { exportTablePdf } from '~/lib/pdf';
import { toast } from '~/lib/toast';

type PoStatus = 'open' | 'partial' | 'received' | 'cancelled';

const STATUS_VARIANT: Record<PoStatus, StatusBadgeVariant> = {
  open: 'muted',
  partial: 'warn',
  received: 'success',
  cancelled: 'danger',
};

function StatusCell({ status }: { status: PoStatus }) {
  return (
    <StatusBadge variant={STATUS_VARIANT[status]}>
      {status === 'open' ? (
        <Trans>Terbuka</Trans>
      ) : status === 'partial' ? (
        <Trans>Sebagian</Trans>
      ) : status === 'received' ? (
        <Trans>Diterima</Trans>
      ) : (
        <Trans>Dibatalkan</Trans>
      )}
    </StatusBadge>
  );
}

// Per-line receive draft: the qty typed by the user, keyed by ingredientId.
type ReceiveDrafts = Record<string, string>;

export function PurchaseOrderDetail({
  id,
  onOpenChange,
}: {
  id: Id<'purchaseOrders'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const detail = useQuery(api.purchaseOrders.get, id ? { id } : 'skip');
  const receive = useMutation(api.purchaseOrders.receive);
  const cancel = useMutation(api.purchaseOrders.cancel);

  const [drafts, setDrafts] = useState<ReceiveDrafts>({});
  const [submitting, setSubmitting] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const editable =
    detail != null && detail.status !== 'received' && detail.status !== 'cancelled';

  // Pre-fill each line's receive qty to its remaining amount whenever the PO
  // changes or its received/remaining values shift (e.g. after a partial
  // receive the query refetches live).
  useEffect(() => {
    if (!detail) {
      setDrafts({});
      return;
    }
    setDrafts(
      Object.fromEntries(
        detail.lines.map((l) => [l.ingredientId, String(l.remainingQty)])
      )
    );
  }, [detail]);

  function setDraft(ingredientId: string, raw: string, remainingQty: number) {
    // Clamp to 0..remainingQty; keep empty string as "0" intent for the UI.
    let next = raw;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isInteger(parsed)) {
      const clamped = Math.max(0, Math.min(parsed, remainingQty));
      next = String(clamped);
    } else if (raw !== '') {
      next = '';
    }
    setDrafts((prev) => ({ ...prev, [ingredientId]: next }));
  }

  // Lines the user wants to receive now (qty > 0).
  const receiveRows = detail
    ? detail.lines
        .map((l) => ({
          ingredientId: l.ingredientId,
          qty: Number.parseInt(drafts[l.ingredientId] ?? '', 10),
        }))
        .filter((r): r is { ingredientId: Id<'ingredients'>; qty: number } =>
          Number.isInteger(r.qty) && r.qty > 0
        )
    : [];

  async function onReceive() {
    if (!id || submitting || receiveRows.length === 0) return;
    setSubmitting(true);
    try {
      await receive({ id, lines: receiveRows });
      toast.success(t`Barang diterima.`);
      // Keep the sheet open; the get/list queries refetch live so the user
      // sees the updated received/sisa values.
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menerima barang.`;
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onCancel() {
    if (!id) return;
    try {
      await cancel({ id });
      toast.success(t`Pesanan beli dibatalkan.`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal membatalkan pesanan beli.`;
      toast.error(message);
      throw err; // ConfirmDialog stays open for retry.
    }
  }

  async function exportPDF() {
    if (!detail) return;
    try {
      await exportTablePdf({
        filename: 'pesanan-beli.pdf',
        title: 'Purchase order',
        subtitle: `${detail.supplierName ?? 'No supplier'} · ${new Date(
          detail.createdAt
        ).toLocaleDateString('en-GB')}`,
        columns: [
          { key: 'name', header: 'Ingredient' },
          { key: 'ordered', header: 'Ordered' },
          { key: 'received', header: 'Received' },
          { key: 'remaining', header: 'Remaining' },
          { key: 'cost', header: 'Unit cost' },
          { key: 'total', header: 'Line total' },
        ],
        rows: detail.lines.map((l) => ({
          name: l.ingredientName,
          ordered: `${l.orderedQty} ${l.unit}`,
          received: String(l.receivedQty),
          remaining: String(l.remainingQty),
          cost: formatIDR(l.unitCostIDR),
          total: formatIDR(l.orderedQty * l.unitCostIDR),
        })),
        numericKeys: ['cost', 'total'],
        footRows: [
          [
            '',
            '',
            '',
            '',
            'Total',
            formatIDR(
              detail.lines.reduce(
                (s, l) => s + l.orderedQty * l.unitCostIDR,
                0
              )
            ),
          ],
        ],
      });
    } catch {
      toast.error(t`Gagal mengunduh PDF.`);
    }
  }

  const orderedTotal = detail
    ? detail.lines.reduce((sum, l) => sum + l.orderedQty * l.unitCostIDR, 0)
    : 0;
  const receivedTotal = detail
    ? detail.lines.reduce((sum, l) => sum + l.receivedQty * l.unitCostIDR, 0)
    : 0;

  return (
    <Sheet open={id !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {detail?.supplierName ?? <Trans>Tanpa pemasok</Trans>}
          </SheetTitle>
          <SheetDescription className="sr-only">
            <Trans>Detail pesanan beli dan penerimaan barang.</Trans>
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 text-sm">
          {detail === undefined ? (
            <div className="flex justify-center py-8">
              <Spinner className="size-6" />
            </div>
          ) : detail === null ? (
            <p className="text-muted-foreground">
              <Trans>Pesanan beli tidak ditemukan.</Trans>
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <StatusCell status={detail.status} />
                <span className="text-muted-foreground tabular-nums">
                  <Trans>Dipesan</Trans> {formatIDR(orderedTotal)}
                </span>
                <span className="text-muted-foreground tabular-nums">
                  <Trans>Diterima</Trans> {formatIDR(receivedTotal)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ml-auto"
                  onClick={exportPDF}
                >
                  <Trans>Unduh PDF</Trans>
                </Button>
              </div>

              {detail.note ? (
                <p className="mt-3 text-muted-foreground">{detail.note}</p>
              ) : null}

              <div className="mt-4 space-y-3">
                {detail.lines.map((line) => (
                  <div
                    key={line.ingredientId}
                    className="rounded-md border border-border p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{line.ingredientName}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatIDR(line.unitCostIDR)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                      <Trans>Dipesan</Trans> {line.orderedQty} {line.unit} ·{' '}
                      <Trans>Diterima</Trans> {line.receivedQty} ·{' '}
                      <Trans>Sisa</Trans> {line.remainingQty}
                    </div>
                    {editable && line.remainingQty > 0 ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          max={line.remainingQty}
                          step="1"
                          className="w-24"
                          aria-label={t`Terima ${line.ingredientName}`}
                          value={drafts[line.ingredientId] ?? ''}
                          onChange={(e) =>
                            setDraft(
                              line.ingredientId,
                              e.target.value,
                              line.remainingQty
                            )
                          }
                        />
                        <span className="text-xs text-muted-foreground">
                          {line.unit}
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {editable ? (
                <div className="mt-4 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setConfirmCancel(true)}
                  >
                    <Trans>Batalkan PO</Trans>
                  </Button>
                  <Button
                    type="button"
                    disabled={submitting || receiveRows.length === 0}
                    onClick={onReceive}
                  >
                    {submitting && <Spinner data-icon="inline-start" />}
                    <Trans>Terima</Trans>
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

        <ConfirmDialog
          open={confirmCancel}
          onOpenChange={setConfirmCancel}
          title={<Trans>Batalkan PO?</Trans>}
          description={
            <Trans>
              Barang yang sudah diterima tetap berada di stok. Pesanan tidak bisa
              menerima barang lagi setelah dibatalkan.
            </Trans>
          }
          confirmLabel={<Trans>Batalkan PO</Trans>}
          destructive
          onConfirm={onCancel}
        />
      </SheetContent>
    </Sheet>
  );
}
