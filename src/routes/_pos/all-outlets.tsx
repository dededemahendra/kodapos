import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { api } from 'convex/_generated/api';
import { useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { RequirePermission } from '~/components/permission/require-permission';
import { Button } from '~/components/ui/button';
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

export const Route = createFileRoute('/_pos/all-outlets')({
  component: AllOutletsPage,
});

type Preset = 'today' | 'last7' | 'last30';

function AllOutletsPage() {
  return (
    <RequirePermission perm="canViewReports">
      <AllOutlets />
    </RequirePermission>
  );
}

function AllOutlets() {
  const [preset, setPreset] = useState<Preset>('last7');
  const data = useQuery(api.reports.businessOverview, { range: { preset } });

  const presets: { key: Preset; label: React.ReactNode }[] = [
    { key: 'today', label: <Trans>Hari ini</Trans> },
    { key: 'last7', label: <Trans>7 hari</Trans> },
    { key: 'last30', label: <Trans>30 hari</Trans> },
  ];

  const tiles =
    data === undefined
      ? []
      : [
          { label: <Trans>Pendapatan</Trans>, value: formatIDR(data.totals.revenueIDR) },
          { label: <Trans>Transaksi</Trans>, value: formatCount(data.totals.orders) },
          { label: <Trans>Rata-rata transaksi</Trans>, value: formatIDR(data.totals.aovIDR) },
          { label: <Trans>Item terjual</Trans>, value: formatCount(data.totals.itemsSold) },
        ];

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-semibold text-lg">
          <Trans>Semua outlet</Trans>
        </h1>
        <div className="flex gap-1">
          {presets.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? 'default' : 'outline'}
              onClick={() => setPreset(p.key)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

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
          {data?.outlets.map((o) => (
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
