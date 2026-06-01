import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { useReportRange } from '~/components/reports/use-report-range';

export const Route = createFileRoute('/_pos/reports/')({
  component: OverviewReport,
});

function OverviewReport() {
  const { range } = useReportRange();
  const data = useQuery(api.reports.overview, { range });
  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Spinner />
      </div>
    );
  }
  const cards: Array<{ label: React.ReactNode; value: string }> = [
    { label: <Trans>Pendapatan</Trans>, value: formatIDR(data.revenueIDR) },
    { label: <Trans>Transaksi</Trans>, value: String(data.orders) },
    { label: <Trans>Rata-rata/transaksi</Trans>, value: formatIDR(data.aovIDR) },
    { label: <Trans>Item terjual</Trans>, value: String(data.itemsSold) },
  ];
  return (
    <div className="grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
      {cards.map((c, i) => (
        <div key={i} className="bg-background p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
