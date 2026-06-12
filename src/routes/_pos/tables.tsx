import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Grid3x3, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { TableManageDialog } from '~/components/tables/table-manage-dialog';
import { Button } from '~/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Spinner } from '~/components/ui/spinner';
import { usePermissions } from '~/lib/permissions';
import { formatIDR } from '~/lib/money';

export const Route = createFileRoute('/_pos/tables')({ component: TablesPage });

function TablesPage() {
  const floor = useQuery(api.tables.floor, {});
  const { isOwner } = usePermissions();
  const [manageOpen, setManageOpen] = useState(false);

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
          {floor.map((table) =>
            table.heldOrderId ? (
              <Link
                key={table._id}
                to="/sale"
                search={{ recall: table.heldOrderId }}
                className="flex flex-col gap-1 rounded-lg border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:border-primary"
              >
                <div className="flex items-center gap-1.5 font-medium">
                  <span className="text-primary" aria-hidden="true">
                    ●
                  </span>
                  <span className="truncate">{table.name}</span>
                </div>
                <span className="text-sm tabular-nums">{formatIDR(table.totalIDR)}</span>
                <span className="text-xs text-muted-foreground">
                  <Trans>{table.itemCount} item</Trans>
                </span>
              </Link>
            ) : (
              <Link
                key={table._id}
                to="/sale"
                search={{ table: table._id }}
                className="flex flex-col gap-1 rounded-lg border border-dashed bg-card p-4 text-card-foreground transition-colors hover:border-primary"
              >
                <span className="truncate font-medium">{table.name}</span>
                <span className="text-xs text-muted-foreground">
                  <Trans>kosong</Trans>
                </span>
              </Link>
            )
          )}
        </div>
      )}

      <TableManageDialog open={manageOpen} onOpenChange={setManageOpen} />
    </main>
  );
}
