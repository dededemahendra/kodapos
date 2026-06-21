import { Trans, useLingui } from '@lingui/react/macro';
import type { ColumnDef } from '@tanstack/react-table';
import { createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { PageHeader } from '~/components/ui/page-header';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select';
import { CardGridSkeleton, ListSkeleton } from '~/components/ui/loading-skeletons';
import { StatusBadge } from '~/components/ui/status-badge';
import { waUrl, formatRestockText } from '~/lib/whatsapp';
import { RenderDriver, type ForecastDriver } from '~/components/forecast/render-driver';
import { AiRestockAdvice } from '~/components/ai-restock-advice';

export const Route = createFileRoute('/_pos/forecast')({
  component: ForecastPage,
});

function ForecastPage() {
  return (
    <RequirePermission perm="canViewReports">
      <ForecastInner />
    </RequirePermission>
  );
}

type RestockLine = { ingredientId: string; name: string; unit: string; suggestedQty: number; currentStockQty: number };

function RestockPanel() {
  const { t } = useLingui();
  const data = useQuery(api.restock.suggestion, {});
  const cafe = useQuery(api.cafes.myCafe, {});
  const suppliers = useQuery(api.suppliers.list, {});
  const [supplierId, setSupplierId] = useState<string>('');
  const [edits, setEdits] = useState<Map<string, number>>(new Map());

  const markSent = useMutation(api.restock.markSent);
  const ready = data?.status === 'ready' ? data : null;
  const lines = ready?.lines ?? [];
  const suggestionId = ready?.suggestionId ?? null;
  const isSent = ready?.suggestionStatus === 'sent';
  const qtyOf = (l: RestockLine) => edits.get(l.ingredientId) ?? l.suggestedQty;

  const columns = useMemo<ColumnDef<RestockLine, unknown>[]>(
    () => [
      { accessorKey: 'name', header: () => <Trans>Bahan</Trans> },
      {
        id: 'suggested',
        header: () => <Trans>Saran</Trans>,
        cell: ({ row }) => (
          <Input
            type="number"
            min="0"
            className="h-8 w-20 text-right tabular-nums"
            value={qtyOf(row.original)}
            onChange={(e) => {
              const n = Math.max(0, Number(e.target.value));
              setEdits((m) => new Map(m).set(row.original.ingredientId, n));
            }}
          />
        ),
      },
      { id: 'unit', header: () => <Trans>Satuan</Trans>, cell: ({ row }) => <span>{row.original.unit}</span> },
      {
        accessorKey: 'currentStockQty',
        header: () => <Trans>Stok kini</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.currentStockQty}</span>,
      },
    ],
    [edits]
  );

  async function onSend() {
    const supplier = suppliers?.find((s) => s._id === supplierId);
    if (!supplier) return;
    const sentLines = lines.map((l) => ({ name: l.name, qty: qtyOf(l), unit: l.unit }));
    if (suggestionId && !isSent) {
      await markSent({ id: suggestionId, supplierId: supplier._id, sentLines });
    }
    const text = formatRestockText(cafe?.name ?? '', sentLines);
    window.open(waUrl(supplier.phone, text), '_blank', 'noopener,noreferrer');
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold"><Trans>Daftar Belanja</Trans></h2>
      {isSent ? <StatusBadge variant="success"><Trans>Terkirim</Trans></StatusBadge> : null}
      {data === undefined ? (
        <ListSkeleton rows={4} className="mt-4" />
      ) : data.status === 'learning' ? (
        <p className="mt-2 text-sm text-muted-foreground"><Trans>Daftar belanja akan muncul setelah perkiraan aktif.</Trans></p>
      ) : lines.length === 0 ? (
        <Empty className="mt-4">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle><Trans>Stok cukup untuk minggu ini.</Trans></EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-4 space-y-4">
          <AiRestockAdvice />
          <DataTable columns={columns} data={lines as RestockLine[]} emptyState={null} initialSort={[{ id: 'name', desc: false }]} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="w-56"><SelectValue placeholder={t`Pilih pemasok`} /></SelectTrigger>
              <SelectContent>
                {(suppliers ?? []).map((s) => (
                  <SelectItem key={s._id} value={s._id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="button" disabled={!supplierId} onClick={onSend}><Trans>Kirim ke WhatsApp</Trans></Button>
          </div>
        </div>
      )}
    </section>
  );
}

type Horizon = 'tomorrow' | 'week';

function ConfidenceBadge({ level }: { level: 'low' | 'med' | 'high' }) {
  if (level === 'high') return <StatusBadge variant="success"><Trans>Tinggi</Trans></StatusBadge>;
  if (level === 'med') return <StatusBadge variant="warn"><Trans>Sedang</Trans></StatusBadge>;
  return <StatusBadge variant="muted"><Trans>Rendah</Trans></StatusBadge>;
}

function ForecastInner() {
  const data = useQuery(api.forecast.demand, {});
  const [horizon, setHorizon] = useState<Horizon>('tomorrow');

  return (
    <main className="p-6">
      <PageHeader title={<Trans>Prediksi Permintaan</Trans>} />
      {data === undefined ? (
        <CardGridSkeleton count={6} className="mt-6" />
      ) : data.status === 'learning' ? (
        <Empty className="mt-6">
          <EmptyHeader>
            <EmptyMedia variant="icon"><TrendingUp /></EmptyMedia>
            <EmptyTitle><Trans>Kami sedang belajar</Trans></EmptyTitle>
            <EmptyDescription>
              <Trans>
                Memerlukan minimal {data.daysNeeded} hari data (terkumpul {data.daysCollected}). Perkiraan akan aktif sekitar {data.etaDateKey}.
              </Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={horizon === 'tomorrow' ? 'default' : 'outline'} onClick={() => setHorizon('tomorrow')}>
              <Trans>Besok</Trans>
            </Button>
            <Button type="button" size="sm" variant={horizon === 'week' ? 'default' : 'outline'} onClick={() => setHorizon('week')}>
              <Trans>7 hari</Trans>
            </Button>
          </div>
          {!data.weatherAvailable ? (
            <p className="text-xs text-muted-foreground">
              <Trans>Data cuaca tidak tersedia.</Trans>
            </p>
          ) : null}
          <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
            {data.lines.map((line) => (
              <li key={line.menuItemId} className="bg-background p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{line.name}</span>
                  <ConfidenceBadge level={line.confidence} />
                </div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">
                  ~{horizon === 'tomorrow' ? line.tomorrowQty : line.sevenDayQty}
                </div>
                {line.drivers.length > 0 ? (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {line.drivers.map((d, i) => (
                      <li key={i}><RenderDriver driver={d as ForecastDriver} /></li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      <RestockPanel />
    </main>
  );
}
