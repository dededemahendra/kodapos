import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { ConciergeBell } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Card, CardContent } from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR, formatRelative } from '~/lib/formater';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/self-orders')({ component: SelfOrdersPage });

function SelfOrdersPage() {
  const { t } = useLingui();
  const navigate = useNavigate();
  const queue = useQuery(api.selfOrders.queue);
  const reject = useMutation(api.selfOrders.reject);
  const [rejectTarget, setRejectTarget] = useState<Id<'selfOrders'> | null>(null);

  return (
    <main className="p-6">
      <PageHeader title={<Trans>Pesanan Masuk</Trans>} />

      {queue === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : queue.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ConciergeBell />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada pesanan masuk.</Trans>
            </EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {queue.map((order) => (
            <Card key={order.id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">
                    {order.tableName ?? t`Tanpa meja`}
                  </span>
                  <Badge variant="secondary" className="shrink-0 font-normal">
                    {formatRelative(order.createdAt)}
                  </Badge>
                </div>

                <ul className="flex flex-col gap-1 text-sm">
                  {order.lines.map((line, idx) => (
                    <li key={idx}>
                      <span className="tabular-nums">{line.qty}×</span>{' '}
                      <span>{line.nameSnapshot}</span>
                      {line.variantName ? (
                        <span className="text-muted-foreground">
                          {' '}
                          · {line.variantName}
                        </span>
                      ) : null}
                      {line.modifierLabels.length > 0 ? (
                        <div className="text-xs text-muted-foreground">
                          {line.modifierLabels.join(', ')}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>

                {order.customerNote ? (
                  <p className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {order.customerNote}
                  </p>
                ) : null}

                <div className="text-sm font-medium tabular-nums">
                  {formatIDR(order.subtotalIDR)}
                </div>

                <div className="mt-1 flex items-center gap-2">
                  <Button
                    type="button"
                    className="flex-1"
                    onClick={() =>
                      navigate({ to: '/sale', search: { selfOrder: order.id } })
                    }
                  >
                    <Trans>Terima</Trans>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setRejectTarget(order.id)}
                  >
                    <Trans>Tolak</Trans>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRejectTarget(null);
        }}
        title={<Trans>Tolak pesanan?</Trans>}
        description={<Trans>Pesanan ini akan dihapus dari daftar pesanan masuk.</Trans>}
        confirmLabel={<Trans>Tolak</Trans>}
        destructive
        onConfirm={async () => {
          if (!rejectTarget) return;
          try {
            await reject({ id: rejectTarget });
            toast.success(t`Pesanan ditolak.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal menolak pesanan.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
