import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { Receipt } from 'lucide-react';
import { useState } from 'react';
import { useReportRange } from '~/components/reports/use-report-range';
import { ReceiptPreview } from '~/components/sale/receipt-preview';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/reports/orders')({
  component: OrdersReport,
});

const ALL = 'all';

function OrdersReport() {
  const { t } = useLingui();
  const { range } = useReportRange();
  const staff = useQuery(api.staff.list, {});
  const [cashier, setCashier] = useState<string>(ALL);
  const [method, setMethod] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);

  const {
    results,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.orders.search,
    {
      range,
      ...(cashier !== ALL ? { cashierId: cashier as Id<'cafeStaff'> } : {}),
      ...(method !== ALL
        ? { paymentMethod: method as 'cash' | 'qris_static' | 'qris_dynamic' }
        : {}),
      ...(status !== ALL
        ? { status: status as 'paid' | 'pending' | 'void' }
        : {}),
    },
    { initialNumItems: 25 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Select value={cashier} onValueChange={setCashier}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua kasir`}</SelectItem>
            {(staff ?? []).map((s) => (
              <SelectItem key={s._id} value={s._id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={method} onValueChange={setMethod}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua metode`}</SelectItem>
            <SelectItem value="cash">{t`Tunai`}</SelectItem>
            <SelectItem value="qris_static">QRIS statis</SelectItem>
            <SelectItem value="qris_dynamic">QRIS dinamis</SelectItem>
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua status`}</SelectItem>
            <SelectItem value="paid">{t`Lunas`}</SelectItem>
            <SelectItem value="pending">{t`Tertunda`}</SelectItem>
            <SelectItem value="void">{t`Batal`}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {pageStatus === 'LoadingFirstPage' ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Spinner />
        </div>
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada pesanan pada rentang ini.</Trans>
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {results.map((o) => (
            <li key={o._id}>
              <button
                type="button"
                onClick={() => setOpenId(o._id)}
                className="w-full text-left p-3 hover:bg-muted"
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm">
                    {new Date(o.createdAtClient).toLocaleString('id-ID')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {formatIDR(o.totalIDR)}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>{o.cashierName}</span>
                  <span>
                    ·{' '}
                    {o.paymentMethod === 'cash' ? t`Tunai` : 'QRIS'}
                  </span>
                  <span>· {t`${o.lineCount} item`}</span>
                  <Badge
                    variant={
                      o.paymentStatus === 'paid'
                        ? 'default'
                        : o.paymentStatus === 'void'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {o.paymentStatus === 'paid' ? (
                      <Trans>Lunas</Trans>
                    ) : o.paymentStatus === 'void' ? (
                      <Trans>Batal</Trans>
                    ) : (
                      <Trans>Tertunda</Trans>
                    )}
                  </Badge>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pageStatus === 'CanLoadMore' ? (
        <Button variant="outline" size="sm" onClick={() => loadMore(25)}>
          <Trans>Muat lebih banyak</Trans>
        </Button>
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
