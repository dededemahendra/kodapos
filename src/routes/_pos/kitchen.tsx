import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { ChefHat } from 'lucide-react';
import { ORDER_TYPE_OPTIONS } from '~/components/sale/order-types';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Spinner } from '~/components/ui/spinner';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/_pos/kitchen')({ component: KitchenPage });

function orderTypeLabel(orderType: 'dine_in' | 'takeaway' | 'pickup' | undefined) {
  return ORDER_TYPE_OPTIONS.find((o) => o.value === orderType)?.label ?? orderType;
}

function KitchenPage() {
  const tickets = useQuery(api.kitchen.tickets, {});
  const advance = useMutation(api.kitchen.advance);

  return (
    <main className="p-6">
      <PageHeader title={<Trans>Dapur</Trans>} />

      {tickets === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : tickets.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ChefHat />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Tidak ada pesanan di dapur.</Trans>
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {[...tickets]
            .sort((a, b) => {
              if (a.kitchenStatus !== b.kitchenStatus) {
                return a.kitchenStatus === 'new' ? -1 : 1;
              }
              return a.createdAtClient - b.createdAtClient;
            })
            .map((t) => (
              <Card
                key={t._id}
                className={cn(
                  'flex flex-col gap-3 p-4',
                  t.kitchenStatus === 'ready' && 'border-primary bg-primary/5'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">
                    {t.tableName ?? orderTypeLabel(t.orderType)}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {new Date(t.createdAtClient).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <ul className="flex flex-col gap-1.5 text-sm">
                  {t.lines.map((l, i) => (
                    <li key={i}>
                      <span className="tabular-nums">{l.qty}×</span> {l.nameSnapshot}
                      {l.modifiers.length > 0 ? (
                        <ul className="mt-0.5 ml-5 flex flex-col text-xs text-muted-foreground">
                          {l.modifiers.map((m, j) => (
                            <li key={j}>{m}</li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {t.kitchenStatus === 'new' ? (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => advance({ orderId: t._id, status: 'ready' })}
                  >
                    <Trans>Siap</Trans>
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    onClick={() => advance({ orderId: t._id, status: 'done' })}
                  >
                    <Trans>Selesai</Trans>
                  </Button>
                )}
              </Card>
            ))}
        </div>
      )}
    </main>
  );
}
