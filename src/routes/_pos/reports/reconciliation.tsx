import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ReceiptPreview } from '~/components/sale/receipt-preview';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { ListSkeleton } from '~/components/ui/loading-skeletons';
import { formatIDR } from '~/lib/money';
import { partitionQueued } from '~/lib/offline/queued-sales';
import { offlineReceiptNumber } from '~/lib/offline/receipt-number';
import { useQueuedSales } from '~/lib/offline/use-queued-sales';
import { usePreference } from '~/lib/preferences';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/reports/reconciliation')({
  component: ReconciliationReport,
});

type Kind =
  | 'price_drift'
  | 'item_unavailable'
  | 'promo_archived'
  | 'negative_stock'
  | 'modifier_rule_changed'
  | 'payment_method_disabled'
  | 'shift_closed'
  | 'cashier_archived'
  | 'price_category_archived';

/** What the owner needs to understand about each row, in one line. */
function kindLabel(kind: Kind): ReactNode {
  switch (kind) {
    case 'price_drift':
      return <Trans>Harga berubah setelah penjualan</Trans>;
    case 'item_unavailable':
      return <Trans>Item tidak lagi tersedia</Trans>;
    case 'promo_archived':
      return <Trans>Promo sudah diarsipkan</Trans>;
    case 'negative_stock':
      return <Trans>Stok jadi minus</Trans>;
    case 'modifier_rule_changed':
      return <Trans>Aturan modifier berubah</Trans>;
    case 'payment_method_disabled':
      return <Trans>Metode pembayaran dimatikan</Trans>;
    case 'shift_closed':
      return <Trans>Masuk setelah shift ditutup</Trans>;
    case 'cashier_archived':
      return <Trans>Kasir sudah diarsipkan</Trans>;
    case 'price_category_archived':
      return <Trans>Kategori harga sudah diarsipkan</Trans>;
  }
}

function ReconciliationReport() {
  const { t } = useLingui();
  // Deliberately NOT range-filtered like its sibling reports: an unresolved
  // discrepancy is outstanding work, not a period statistic, and one from last
  // week must not vanish because the range picker says "today".
  const rows = useQuery(api.reconciliation.listOpen, {});
  const resolve = useMutation(api.reconciliation.resolve);
  const outbox = useQueuedSales();
  // Same prefix the offline receipt was printed with, so the code on the paper
  // in the customer's hand matches the code listed here.
  const [orderPrefix] = usePreference<string>('orderPrefix', '');
  const { deadLettered } = partitionQueued(outbox.sales);
  // Hoisted out of the <Trans> below: a lingui message placeholder must be a
  // plain variable, not an expression, or its msgid changes with the code.
  const deadLetteredTotal = formatIDR(deadLettered.reduce((sum, s) => sum + s.payload.totalIDR, 0));
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);
  const [resolving, setResolving] = useState<Id<'saleReconciliations'> | null>(null);

  async function onResolve(id: Id<'saleReconciliations'>) {
    setResolving(id);
    try {
      await resolve({ id });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menandai selesai.`);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            <Trans>Penjualan gagal terkirim</Trans>
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Penjualan tunai yang sudah dibayar pelanggan tapi tidak pernah berhasil masuk ke
              server dari perangkat ini. Uangnya ada di laci, tapi transaksinya belum tercatat —
              masukkan manual, lalu simpan catatan ini.
            </Trans>
          </p>
        </div>

        {outbox.error ? (
          <p role="status" className="text-sm text-red-600">
            <Trans>
              Antrean offline di perangkat ini tidak bisa dibaca. Tutup tab kodapos lain lalu muat
              ulang halaman.
            </Trans>
          </p>
        ) : null}

        {!outbox.loaded ? (
          <ListSkeleton rows={2} />
        ) : deadLettered.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Trans>Tidak ada penjualan yang gagal terkirim di perangkat ini.</Trans>
          </p>
        ) : (
          <>
            <p className="text-sm font-medium text-red-600">
              <Plural
                value={deadLettered.length}
                one="# penjualan belum tercatat di server."
                other="# penjualan belum tercatat di server."
              />{' '}
              <Trans>Total {deadLetteredTotal}.</Trans>
            </p>
            <ul className="divide-y divide-border rounded-md border border-red-300">
              {deadLettered.map((sale) => (
                <li key={sale.clientId} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-sm">
                      {offlineReceiptNumber(orderPrefix, sale.clientId)}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {formatIDR(sale.payload.totalIDR)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      <Trans>Masuk antrean</Trans>:{' '}
                      {new Date(sale.queuedAt).toLocaleString('id-ID')}
                    </span>
                    <span>
                      · <Plural value={sale.payload.lines.length} one="# item" other="# item" />
                    </span>
                    <span>
                      · <Trans>Gagal</Trans> {sale.attempts}×
                    </span>
                    {/* The full clientId, because a manual re-entry has to be
                        traceable back to the exact outbox row. */}
                    <span className="font-mono">· {sale.clientId}</span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">
            <Trans>Selisih penjualan offline</Trans>
          </h2>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Penjualan offline yang sudah masuk, tapi kondisinya berubah selama koneksi putus.
              Pesanannya tercatat persis seperti yang ditagih ke pelanggan; catatan ini hanya untuk
              ditinjau.
            </Trans>
          </p>
        </div>

        {rows === undefined ? (
          <ListSkeleton rows={3} />
        ) : rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircleCheck />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Tidak ada selisih yang perlu ditinjau.</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>Catatan akan muncul di sini saat penjualan offline terkirim.</Trans>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {rows.map((row) => (
              <li key={row._id} className="flex flex-wrap items-start gap-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={row.kind === 'price_drift' ? 'destructive' : 'secondary'}>
                      {kindLabel(row.kind)}
                    </Badge>
                    {row.detail ? <span className="text-sm">{row.detail}</span> : null}
                  </div>
                  {row.rungIDR !== null && row.currentIDR !== null ? (
                    <div className="mt-1 text-sm tabular-nums">
                      <Trans>Ditagih</Trans> {formatIDR(row.rungIDR)} ·{' '}
                      <Trans>Harga sekarang</Trans> {formatIDR(row.currentIDR)} ·{' '}
                      <span
                        className={
                          row.currentIDR > row.rungIDR ? 'text-red-600' : 'text-emerald-600'
                        }
                      >
                        <Trans>Selisih</Trans> {formatIDR(row.currentIDR - row.rungIDR)}
                      </span>
                    </div>
                  ) : null}
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{new Date(row.createdAt).toLocaleString('id-ID')}</span>
                    {row.orderTotalIDR !== null ? (
                      <span>
                        · <Trans>Total pesanan</Trans> {formatIDR(row.orderTotalIDR)}
                      </span>
                    ) : null}
                    <span className="font-mono">
                      · {offlineReceiptNumber(orderPrefix, row.clientId)}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setOpenId(row.orderId)}>
                    <Trans>Lihat pesanan</Trans>
                  </Button>
                  <Button
                    size="sm"
                    disabled={resolving === row._id}
                    onClick={() => void onResolve(row._id)}
                  >
                    <Trans>Tandai selesai</Trans>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rows !== undefined && rows.length > 0 ? (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <Trans>
            Menandai selesai hanya menutup catatannya. Pesanan dan uangnya tidak ikut berubah.
          </Trans>
        </p>
      ) : null}

      <ReceiptPreview
        open={openId !== null}
        onOpenChange={(open) => {
          if (!open) setOpenId(null);
        }}
        orderId={openId}
        onDone={() => setOpenId(null)}
      />
    </div>
  );
}
