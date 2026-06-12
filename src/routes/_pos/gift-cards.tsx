import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Gift, Plus, Wallet } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  GiftCardIssueDialog,
  GiftCardTopupDialog,
} from '~/components/giftcard/gift-card-form-dialog';
import { RequirePermission } from '~/components/permission/require-permission';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { RowActions } from '~/components/ui/row-actions';
import { StatusBadge } from '~/components/ui/status-badge';
import { Toolbar } from '~/components/ui/toolbar';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/gift-cards')({ component: GiftCardsPage });

function GiftCardsPage() {
  return (
    <RequirePermission perm="canEditMenu">
      <GiftCardsInner />
    </RequirePermission>
  );
}

type GiftCard = Doc<'giftCards'>;
type Filter = 'active' | 'archived';

function GiftCardsInner() {
  const { t } = useLingui();
  const [filter, setFilter] = useState<Filter>('active');
  const [issueOpen, setIssueOpen] = useState(false);
  const [topupCard, setTopupCard] = useState<GiftCard | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<GiftCard | null>(null);

  const cards = useQuery(api.giftCards.list, { includeArchived: true });
  const archive = useMutation(api.giftCards.archive);

  const counts = useMemo(() => {
    if (!cards) return undefined;
    return {
      active: cards.filter((c) => c.status === 'active').length,
      archived: cards.filter((c) => c.status === 'archived').length,
    };
  }, [cards]);

  const visible = useMemo<GiftCard[] | undefined>(() => {
    if (!cards) return undefined;
    return cards.filter((c) => c.status === filter);
  }, [cards, filter]);

  const openTopup = useCallback((c: GiftCard) => {
    setTopupCard(c);
  }, []);

  const columns = useMemo<ColumnDef<GiftCard, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: () => <Trans>Kode kartu</Trans>,
        cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.code}</span>,
      },
      {
        accessorKey: 'balanceIDR',
        header: () => <Trans>Saldo</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{formatIDR(row.original.balanceIDR)}</span>,
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) =>
          row.original.status === 'archived' ? (
            <StatusBadge variant="muted"><Trans>Arsip</Trans></StatusBadge>
          ) : (
            <StatusBadge variant="success"><Trans>Aktif</Trans></StatusBadge>
          ),
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) =>
          row.original.status === 'archived' ? null : (
            <div className="text-right">
              <RowActions
                label={t`Aksi baris`}
                items={[
                  { label: <Trans>Isi saldo</Trans>, icon: <Wallet />, onSelect: () => openTopup(row.original) },
                  { label: <Trans>Arsipkan</Trans>, icon: <Archive />, destructive: true, separatorBefore: true, onSelect: () => setArchiveTarget(row.original) },
                ]}
              />
            </div>
          ),
      },
    ],
    [t, openTopup]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon"><Gift /></EmptyMedia>
        <EmptyTitle>{filter === 'archived' ? <Trans>Tidak ada kartu hadiah diarsipkan.</Trans> : <Trans>Belum ada kartu hadiah.</Trans>}</EmptyTitle>
        <EmptyDescription>{filter === 'archived' ? <Trans>Kartu yang diarsipkan akan muncul di sini.</Trans> : <Trans>Terbitkan kartu untuk mulai menjual voucher prabayar.</Trans>}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Kartu Hadiah</Trans>}
        meta={counts ? <Trans>{counts.active} kartu aktif</Trans> : null}
        actions={<Button type="button" onClick={() => setIssueOpen(true)}><Plus /><Trans>Terbitkan kartu</Trans></Button>}
      />
      <Toolbar
        active={filter}
        onFilter={(v) => setFilter(v as Filter)}
        filters={[
          { label: <Trans>Aktif</Trans>, value: 'active', ...(counts !== undefined ? { count: counts.active } : {}) },
          { label: <Trans>Arsip</Trans>, value: 'archived', ...(counts !== undefined ? { count: counts.archived } : {}) },
        ]}
      />
      <DataTable columns={columns} data={visible} emptyState={emptyState} initialSort={[{ id: 'code', desc: false }]} />
      <GiftCardIssueDialog open={issueOpen} onOpenChange={setIssueOpen} />
      <GiftCardTopupDialog
        open={topupCard !== null}
        card={topupCard}
        onOpenChange={(o) => {
          if (!o) setTopupCard(null);
        }}
      />
      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
        title={<Trans>Arsipkan kartu hadiah?</Trans>}
        description={archiveTarget ? <Trans>"{archiveTarget.code}" tidak akan bisa digunakan lagi.</Trans> : undefined}
        confirmLabel={<Trans>Arsipkan</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Kartu hadiah diarsipkan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal mengarsipkan kartu hadiah.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
