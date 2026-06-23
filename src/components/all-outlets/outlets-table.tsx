import { useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatCount, formatIDR } from '~/lib/formater';
import { cn } from '~/lib/utils';

type OutletRow = {
  cafeId: Id<'cafes'>;
  name: string;
  revenueIDR: number;
  orders: number;
  aovIDR: number;
  itemsSold: number;
};

type SortKey = 'name' | 'revenueIDR' | 'orders' | 'aovIDR' | 'itemsSold';

export function OutletsTable({ outlets }: { outlets: OutletRow[] }) {
  const navigate = useNavigate();
  const setActiveOutlet = useMutation(api.outlets.setActiveOutlet);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'revenueIDR',
    dir: 'desc',
  });

  const topCafeId = outlets.reduce<OutletRow | null>(
    (best, o) => (best === null || o.revenueIDR > best.revenueIDR ? o : best),
    null
  )?.cafeId;

  const sorted = [...outlets].sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1;
    if (sort.key === 'name') return a.name.localeCompare(b.name, 'id-ID') * dir;
    return (a[sort.key] - b[sort.key]) * dir;
  });

  function toggleSort(key: SortKey): void {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' }
    );
  }

  async function openOutlet(cafeId: Id<'cafes'>): Promise<void> {
    await setActiveOutlet({ cafeId });
    navigate({ to: '/dashboard' });
  }

  const numericCols: { key: SortKey; label: React.ReactNode }[] = [
    { key: 'revenueIDR', label: <Trans>Pendapatan</Trans> },
    { key: 'orders', label: <Trans>Transaksi</Trans> },
    { key: 'aovIDR', label: <Trans>Rata-rata</Trans> },
    { key: 'itemsSold', label: <Trans>Item</Trans> },
  ];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <button type="button" className="hover:underline" onClick={() => toggleSort('name')}>
              <Trans>Outlet</Trans>
            </button>
          </TableHead>
          {numericCols.map((c) => (
            <TableHead key={c.key} className="text-right">
              <button type="button" className="hover:underline" onClick={() => toggleSort(c.key)}>
                {c.label}
              </button>
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((o) => (
          <TableRow
            key={o.cafeId}
            role="button"
            tabIndex={0}
            onClick={() => void openOutlet(o.cafeId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void openOutlet(o.cafeId);
              }
            }}
            className={cn('cursor-pointer', o.cafeId === topCafeId && 'bg-muted/50')}
          >
            <TableCell className="font-medium">
              <span className="inline-flex items-center gap-2">
                {o.name}
                {o.cafeId === topCafeId ? (
                  <Badge variant="secondary">
                    <Trans>Teratas</Trans>
                  </Badge>
                ) : null}
              </span>
            </TableCell>
            <TableCell className="text-right">{formatIDR(o.revenueIDR)}</TableCell>
            <TableCell className="text-right">{formatCount(o.orders)}</TableCell>
            <TableCell className="text-right">{formatIDR(o.aovIDR)}</TableCell>
            <TableCell className="text-right">{formatCount(o.itemsSold)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
