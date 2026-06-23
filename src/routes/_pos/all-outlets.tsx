import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { Trans } from '@lingui/react/macro';
import { Store } from 'lucide-react';
import { RequirePermission } from '~/components/permission/require-permission';
import { RangePicker } from '~/components/reports/range-picker';
import { parseReportSearch, useAllOutletsRange } from '~/components/reports/use-report-range';
import { DashboardCard } from '~/components/dashboard-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatCount, formatIDR } from '~/lib/formater';
import { OutletsRevenueChart } from '~/components/all-outlets/outlets-revenue-chart';
import { StatCardsSkeleton } from '~/components/ui/loading-skeletons';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';

export const Route = createFileRoute('/_pos/all-outlets')({
  validateSearch: parseReportSearch,
  component: AllOutletsPage,
});

function AllOutletsPage() {
  return (
    <RequirePermission perm="canViewReports">
      <AllOutlets />
    </RequirePermission>
  );
}

function AllOutlets() {
  const { search, range, setPreset, setCustom } = useAllOutletsRange();
  const data = useQuery(api.reports.businessOverview, { range });

  const tiles =
    data === undefined
      ? []
      : [
          { label: <Trans>Pendapatan</Trans>, value: formatIDR(data.totals.revenueIDR) },
          { label: <Trans>Transaksi</Trans>, value: formatCount(data.totals.orders) },
          { label: <Trans>Rata-rata transaksi</Trans>, value: formatIDR(data.totals.aovIDR) },
          { label: <Trans>Item terjual</Trans>, value: formatCount(data.totals.itemsSold) },
        ];

  const header = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
      <h1 className="font-semibold text-lg">
        <Trans>Semua outlet</Trans>
      </h1>
      <RangePicker search={search} setPreset={setPreset} setCustom={setCustom} />
    </div>
  );

  if (data === undefined) {
    return (
      <div className="p-4">
        {header}
        <StatCardsSkeleton count={4} className="mb-6" />
        <Skeleton className="mb-6 h-60 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (data.totals.orders === 0) {
    return (
      <div className="p-4">
        {header}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Store />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada penjualan pada rentang ini.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Coba ubah rentang tanggal di atas.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  return (
    <div className="p-4">
      {header}

      <div className="mb-6 grid grid-cols-2 gap-px bg-border lg:grid-cols-4">
        {tiles.map((tile, i) => (
          <DashboardCard key={i}>
            <div className="p-4">
              <p className="text-muted-foreground text-xs">{tile.label}</p>
              <p className="mt-1 font-semibold text-xl">{tile.value}</p>
            </div>
          </DashboardCard>
        ))}
      </div>

      <OutletsRevenueChart outlets={data.outlets} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead><Trans>Outlet</Trans></TableHead>
            <TableHead className="text-right"><Trans>Pendapatan</Trans></TableHead>
            <TableHead className="text-right"><Trans>Transaksi</Trans></TableHead>
            <TableHead className="text-right"><Trans>Rata-rata</Trans></TableHead>
            <TableHead className="text-right"><Trans>Item</Trans></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.outlets.map((o) => (
            <TableRow key={o.cafeId}>
              <TableCell className="font-medium">{o.name}</TableCell>
              <TableCell className="text-right">{formatIDR(o.revenueIDR)}</TableCell>
              <TableCell className="text-right">{formatCount(o.orders)}</TableCell>
              <TableCell className="text-right">{formatIDR(o.aovIDR)}</TableCell>
              <TableCell className="text-right">{formatCount(o.itemsSold)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
