import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { usePaginatedQuery, useQuery } from 'convex/react';
import { Receipt, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useReportRange } from '~/components/reports/use-report-range';
import { ORDER_TYPE_OPTIONS } from '~/components/sale/order-types';
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
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import {
  CODE_SEARCH_PAGE_SIZE,
  codeSearchExhausted,
  isPartialReceiptCode,
  normalizeReceiptCode,
  RECEIPT_CODE_LENGTH,
  shouldAutoLoadMore,
  shouldShowOrderList,
} from '~/lib/order-search';

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
  const [orderType, setOrderType] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [openId, setOpenId] = useState<Id<'orders'> | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const code = normalizeReceiptCode(codeInput);

  const {
    results,
    status: pageStatus,
    loadMore,
  } = usePaginatedQuery(
    api.orders.search,
    {
      range,
      ...(code !== null ? { q: code } : {}),
      ...(cashier !== ALL ? { cashierId: cashier as Id<'cafeStaff'> } : {}),
      ...(method !== ALL
        ? { paymentMethod: method as 'cash' | 'qris_static' | 'qris_dynamic' | 'split' }
        : {}),
      ...(orderType !== ALL ? { orderType: orderType as 'dine_in' | 'takeaway' | 'pickup' } : {}),
      ...(status !== ALL ? { status: status as 'paid' | 'pending' | 'void' } : {}),
    },
    { initialNumItems: 25 }
  );

  // `orders.search` cannot push a receipt-code match into the Convex index
  // filter — the code is a derived string slice of `_id`/`clientId`, not a
  // stored field — so it only narrows the page it just fetched. Results are
  // date-descending, so a receipt from this morning sits well past page 1 by
  // the afternoon: the first page comes back empty with `isDone: false` and
  // the cashier reads a confident "not found" for exactly the sale they need
  // to refund. So when a code is being searched, keep pulling pages until it
  // turns up or the range runs out.
  const searchKey = [code ?? '', JSON.stringify(range), cashier, method, orderType, status].join(
    '|'
  );
  const [loadState, setLoadState] = useState({ key: '', pages: 0 });
  const pagesLoaded = loadState.key === searchKey ? loadState.pages : 0;
  const resultCount = results.length;
  const searchState = useMemo(
    () => ({ code, resultCount, status: pageStatus, pagesLoaded }),
    [code, resultCount, pageStatus, pagesLoaded]
  );
  const autoLoading = code !== null && resultCount === 0 && pageStatus !== 'Exhausted';
  const gaveUp = codeSearchExhausted(searchState);

  useEffect(() => {
    // The page cap inside shouldAutoLoadMore is also the loop's stop condition:
    // pagesLoaded rises on every pull, so this can never spin even if loadMore
    // were to leave the status untouched.
    if (!shouldAutoLoadMore(searchState)) return;
    setLoadState({ key: searchKey, pages: searchState.pagesLoaded + 1 });
    loadMore(CODE_SEARCH_PAGE_SIZE);
  }, [searchState, searchKey, loadMore]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="w-44 pl-8"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            maxLength={RECEIPT_CODE_LENGTH}
            aria-label={t`Kode struk`}
            placeholder={t`Kode struk`}
          />
        </div>

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
            <SelectItem value="split">{t`Bagi pembayaran`}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={orderType} onValueChange={setOrderType}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t`Semua tipe pesanan`}</SelectItem>
            {ORDER_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
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

      {isPartialReceiptCode(codeInput) ? (
        // A partial code (e.g. "EF1") normalizes to no `q` at all — see
        // normalizeReceiptCode — so the query below silently returns the
        // whole unfiltered range instead of "no results". This branch has to
        // outrank both the loading spinner and the result list: on a busy
        // day `results.length` is never 0 here, so nothing else would ever
        // say the search was ignored rather than empty.
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Kode struk harus 4 karakter.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Ketik 4 karakter terakhir yang tercetak di struk.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : pageStatus === 'LoadingFirstPage' || (autoLoading && !gaveUp) ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
          <Spinner />
          {code !== null ? (
            <span className="text-sm">
              <Trans>Mencari kode struk {code}…</Trans>
            </span>
          ) : null}
        </div>
      ) : shouldShowOrderList(codeInput, results.length) ? (
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
                    {o.paymentMethod === 'cash'
                      ? t`Tunai`
                      : o.paymentMethod === 'split'
                        ? t`Bagi pembayaran`
                        : 'QRIS'}
                  </span>
                  <span>· {t`${o.lineCount} item`}</span>
                  {o.orderType ? (
                    <span>· {ORDER_TYPE_OPTIONS.find((x) => x.value === o.orderType)?.label}</span>
                  ) : null}
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
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Receipt />
            </EmptyMedia>
            <EmptyTitle>
              {gaveUp ? (
                <Trans>Pencarian dihentikan sebelum selesai.</Trans>
              ) : code !== null ? (
                <Trans>Struk {code} tidak ditemukan pada rentang ini.</Trans>
              ) : (
                <Trans>Belum ada pesanan pada rentang ini.</Trans>
              )}
            </EmptyTitle>
            <EmptyDescription>
              {gaveUp ? (
                <Trans>
                  Terlalu banyak pesanan pada rentang ini. Persempit rentang tanggalnya lalu cari
                  lagi.
                </Trans>
              ) : (
                <Trans>Coba ubah filter atau rentang tanggal di atas.</Trans>
              )}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
