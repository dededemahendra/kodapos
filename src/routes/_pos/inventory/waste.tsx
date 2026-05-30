import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { WasteDialog } from '~/components/inventory/waste-dialog';
import { Button } from '~/components/ui/button';
import { Spinner } from '~/components/ui/spinner';
import { formatDate } from '~/lib/formater';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/inventory/waste')({
  component: WastePage,
});

// Raw → translated labels, mirroring the dialog so the table reads in the UI locale.
const REASON_LABELS: Record<string, React.ReactNode> = {
  rusak: <Trans>Rusak</Trans>,
  basi: <Trans>Basi/Kedaluwarsa</Trans>,
  tumpah: <Trans>Tumpah</Trans>,
  salah_masak: <Trans>Salah masak</Trans>,
  lainnya: <Trans>Lainnya</Trans>,
};

function WastePage() {
  const [open, setOpen] = useState(false);
  const rows = useQuery(api.waste.recent, {});
  const isLoading = rows === undefined;
  const totalLoss = (rows ?? []).reduce((sum, r) => sum + r.totalCostIDR, 0);

  return (
    <main className="p-6">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          <Trans>Catat Limbah</Trans>
        </h1>
        <Button type="button" onClick={() => setOpen(true)}>
          <Trans>+ Catat Limbah</Trans>
        </Button>
      </header>

      <div className="mb-4 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
        <Trans>Kerugian limbah (30 hari):</Trans>{' '}
        <span className="font-semibold tabular-nums">{formatIDR(totalLoss)}</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Spinner />
          <span>
            <Trans>Memuat…</Trans>
          </span>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground">
          <Trans>Belum ada limbah tercatat dalam 30 hari terakhir.</Trans>
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-2">
                <Trans>Tanggal</Trans>
              </th>
              <th className="px-2 py-2">
                <Trans>Bahan</Trans>
              </th>
              <th className="w-24 px-2 py-2 text-right">
                <Trans>Jumlah</Trans>
              </th>
              <th className="w-40 px-2 py-2">
                <Trans>Alasan</Trans>
              </th>
              <th className="w-32 px-2 py-2 text-right">
                <Trans>Kerugian</Trans>
              </th>
              <th className="px-2 py-2">
                <Trans>Catatan</Trans>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-muted">
                <td className="px-2 py-2 tabular-nums">
                  {formatDate(new Date(r.at).toISOString(), 'day-month')}
                </td>
                <td className="px-2 py-2">{r.ingredientName}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {r.qtyWasted} {r.unit}
                </td>
                <td className="px-2 py-2">{REASON_LABELS[r.wasteReason] ?? r.wasteReason}</td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {formatIDR(r.totalCostIDR)}
                </td>
                <td className="px-2 py-2 text-muted-foreground">{r.note ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <WasteDialog open={open} onOpenChange={setOpen} />
    </main>
  );
}
