import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { ShoppingCart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Skeleton } from '~/components/ui/skeleton';
import {
  readDisplay,
  subscribeDisplay,
  type DisplayPayload,
} from '~/lib/customer-display';
import { formatIDR } from '~/lib/money';

// Standalone full-screen customer-facing view. Lives at the top level (NOT
// under _pos) so it renders bare, with no app sidebar/chrome, while still
// inheriting Convex/auth context from __root. The cashier drags this window to
// the till's second monitor; it mirrors the live cart via localStorage.
export const Route = createFileRoute('/display')({
  component: CustomerDisplay,
});

function CustomerDisplay() {
  const [data, setData] = useState<DisplayPayload>(() => readDisplay());
  useEffect(() => subscribeDisplay(setData), []);
  const cafe = useQuery(api.cafes.myCafe, {});

  const isIdle = !data || data.lines.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="flex items-center gap-4 border-b px-8 py-6">
        {cafe === undefined ? (
          <>
            <Skeleton className="h-12 w-12 rounded-md" />
            <Skeleton className="h-8 w-48" />
          </>
        ) : (
          <>
            {cafe?.logoUrl ? (
              <img
                src={cafe.logoUrl}
                alt=""
                className="h-12 w-12 rounded-md object-cover"
              />
            ) : null}
            <span className="text-3xl font-bold tracking-tight">
              {cafe?.name ?? 'kodapos'}
            </span>
          </>
        )}
      </header>

      {isIdle ? (
        <div className="flex flex-1 items-center justify-center p-8">
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon" className="size-16 [&_svg:not([class*='size-'])]:size-9">
                <ShoppingCart />
              </EmptyMedia>
              <EmptyTitle className="text-4xl">
                <Trans>Selamat datang</Trans>
              </EmptyTitle>
              <EmptyDescription className="text-xl">
                <Trans>Pesanan Anda akan tampil di sini.</Trans>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <ul className="flex-1 divide-y overflow-y-auto px-8">
            {data!.lines.map((line, i) => (
              <li
                key={i}
                className="flex items-baseline justify-between gap-6 py-5"
              >
                <span className="text-2xl md:text-3xl">
                  <span className="font-bold tabular-nums">{line.qty}x</span>{' '}
                  {line.name}
                  {line.variantName ? (
                    <span className="text-muted-foreground"> ({line.variantName})</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-2xl md:text-3xl font-semibold tabular-nums">
                  {formatIDR(line.lineTotalIDR)}
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t bg-muted/30 px-8 py-6 space-y-3">
            <Row
              label={<Trans>Subtotal</Trans>}
              value={formatIDR(data!.subtotalIDR)}
            />
            {data!.discountIDR > 0 ? (
              <Row
                label={
                  data!.promoName ? (
                    <>
                      <Trans>Diskon</Trans>{' '}
                      <span className="text-muted-foreground">({data!.promoName})</span>
                    </>
                  ) : (
                    <Trans>Diskon</Trans>
                  )
                }
                value={`- ${formatIDR(data!.discountIDR)}`}
              />
            ) : null}
            {data!.serviceChargeIDR > 0 ? (
              <Row
                label={<Trans>Layanan</Trans>}
                value={formatIDR(data!.serviceChargeIDR)}
              />
            ) : null}
            {data!.taxIDR > 0 ? (
              <Row
                label={<Trans>Pajak</Trans>}
                value={formatIDR(data!.taxIDR)}
              />
            ) : null}
            <div className="flex items-baseline justify-between gap-6 border-t pt-4">
              <span className="text-3xl md:text-4xl font-bold">
                <Trans>Total</Trans>
              </span>
              <span className="text-4xl md:text-5xl font-extrabold tabular-nums">
                {formatIDR(data!.totalIDR)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode;
  value: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6 text-xl md:text-2xl">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
