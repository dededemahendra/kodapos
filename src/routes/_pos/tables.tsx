import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { Grid3x3, QrCode, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { QrPrintDialog } from '~/components/sale/qr-print-dialog';
import { TableManageDialog } from '~/components/tables/table-manage-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Spinner } from '~/components/ui/spinner';
import { usePermissions } from '~/lib/permissions';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/tables')({ component: TablesPage });

function TablesPage() {
  const floor = useQuery(api.tables.floor, {});
  const todayRes = useQuery(api.reservations.todayByTable, {});
  const { isOwner } = usePermissions();
  const { t } = useLingui();
  const [manageOpen, setManageOpen] = useState(false);
  const [qrTarget, setQrTarget] = useState<{ id: Id<'tables'>; name: string } | null>(null);

  const reservationByTable = new Map<
    Id<'tables'>,
    { at: number; customerName: string; partySize: number }
  >();
  if (todayRes !== undefined) {
    for (const r of todayRes) {
      const existing = reservationByTable.get(r.tableId);
      if (existing === undefined || r.at < existing.at) {
        reservationByTable.set(r.tableId, {
          at: r.at,
          customerName: r.customerName,
          partySize: r.partySize,
        });
      }
    }
  }

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Meja</Trans>}
        actions={
          isOwner ? (
            <Button type="button" variant="outline" onClick={() => setManageOpen(true)}>
              <Settings2 />
              <Trans>Kelola meja</Trans>
            </Button>
          ) : null
        }
      />

      {floor === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : floor.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Grid3x3 />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada meja.</Trans>
            </EmptyTitle>
            {isOwner ? (
              <EmptyDescription>
                <Trans>Buka "Kelola meja" untuk menambah meja.</Trans>
              </EmptyDescription>
            ) : null}
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {floor.map((table) => {
            const reservation = reservationByTable.get(table._id);
            const reservationChip = reservation ? (
              <Badge variant="secondary" className="w-fit font-normal">
                {t`Reservasi ${new Date(reservation.at).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })} · ${reservation.partySize}`}
              </Badge>
            ) : null;

            const qrButton = (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={t`Cetak QR ${table.name}`}
                className="absolute right-1.5 top-1.5 size-7"
                onClick={() => setQrTarget({ id: table._id, name: table.name })}
              >
                <QrCode className="size-4" />
              </Button>
            );

            return table.heldOrderId ? (
              <div key={table._id} className="relative">
                <Link
                  to="/sale"
                  search={{ recall: table.heldOrderId }}
                  className={`flex flex-col gap-1 rounded-lg border bg-card p-4 pr-9 text-card-foreground shadow-sm transition-colors hover:border-primary${
                    reservation ? ' ring-1 ring-primary/30' : ''
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="text-primary" aria-hidden="true">
                      ●
                    </span>
                    <span className="truncate">{table.name}</span>
                  </div>
                  {reservationChip}
                  <span className="text-sm tabular-nums">{formatIDR(table.totalIDR)}</span>
                  <span className="text-xs text-muted-foreground">
                    <Trans>{table.itemCount} item</Trans>
                  </span>
                </Link>
                {qrButton}
              </div>
            ) : (
              <div key={table._id} className="relative">
                <Link
                  to="/sale"
                  search={{ table: table._id }}
                  className={`flex flex-col gap-1 rounded-lg border border-dashed bg-card p-4 pr-9 text-card-foreground transition-colors hover:border-primary${
                    reservation ? ' ring-1 ring-primary/30' : ''
                  }`}
                >
                  <span className="truncate font-medium">{table.name}</span>
                  {reservationChip}
                  <span className="text-xs text-muted-foreground">
                    <Trans>kosong</Trans>
                  </span>
                </Link>
                {qrButton}
              </div>
            );
          })}
        </div>
      )}

      <TableManageDialog open={manageOpen} onOpenChange={setManageOpen} />
      <QrPrintDialog
        open={qrTarget !== null}
        onOpenChange={(o) => {
          if (!o) setQrTarget(null);
        }}
        tableId={qrTarget?.id ?? null}
        tableName={qrTarget?.name ?? ''}
      />
    </main>
  );
}
