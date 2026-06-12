import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { CalendarClock, CalendarDays, Check, CircleSlash, Pencil, Trash2, UserCheck, XCircle } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import {
  type ReservationRow,
  ReservationFormDialog,
} from '~/components/reservations/reservation-form-dialog';
import { Button } from '~/components/ui/button';
import { Calendar } from '~/components/ui/calendar';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { type RowAction, RowActions } from '~/components/ui/row-actions';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { StatusBadge } from '~/components/ui/status-badge';
import type { StatusBadgeVariant } from '~/components/ui/status-badge-variant';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/reservations')({ component: ReservationsPage });

type ReservationStatus = ReservationRow['status'];
type StatusFilter = 'all' | ReservationStatus;

const STATUS_META: Record<
  ReservationStatus,
  { variant: StatusBadgeVariant; label: React.ReactNode }
> = {
  booked: { variant: 'muted', label: <Trans context="reservation status">Dipesan</Trans> },
  // No 'info' StatusBadge variant exists; 'warn' reads as an in-progress state.
  seated: { variant: 'warn', label: <Trans>Duduk</Trans> },
  completed: { variant: 'success', label: <Trans>Selesai</Trans> },
  cancelled: { variant: 'danger', label: <Trans>Dibatalkan</Trans> },
  no_show: { variant: 'warn', label: <Trans>Tidak datang</Trans> },
};

function timeLabel(at: number): string {
  return new Date(at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function dateLabel(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ReservationsPage() {
  const { t } = useLingui();
  const setStatus = useMutation(api.reservations.setStatus);
  const remove = useMutation(api.reservations.remove);

  const [day, setDay] = useState<Date>(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [status, setStatusFilter] = useState<StatusFilter>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ReservationRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ReservationRow | null>(null);

  // The selected day's [start, end] bounds in local time → ms window.
  const { from, to } = useMemo(() => {
    const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    const end = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
    return { from: start.getTime(), to: end.getTime() };
  }, [day]);

  const data = useQuery(api.reservations.list, {
    from,
    to,
    ...(status !== 'all' ? { status } : {}),
  });

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  const openEdit = useCallback((row: ReservationRow) => {
    setEditing(row);
    setFormOpen(true);
  }, []);

  const advanceStatus = useCallback(
    async (id: ReservationRow['id'], next: ReservationStatus, successMsg: string) => {
      try {
        await setStatus({ id, status: next });
        toast.success(successMsg);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t`Gagal memperbarui status.`);
      }
    },
    [setStatus, t]
  );

  const columns = useMemo<ColumnDef<ReservationRow, unknown>[]>(
    () => [
      {
        accessorKey: 'at',
        header: () => <Trans>Waktu</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{timeLabel(row.original.at)}</span>,
      },
      {
        accessorKey: 'customerName',
        enableSorting: false,
        header: () => <Trans>Tamu</Trans>,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.customerName}</div>
            {row.original.phone ? (
              <div className="text-muted-foreground text-xs tabular-nums">
                {row.original.phone}
              </div>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: 'partySize',
        header: () => <Trans>Jumlah</Trans>,
        cell: ({ row }) => <span className="tabular-nums">{row.original.partySize}</span>,
      },
      {
        id: 'table',
        enableSorting: false,
        header: () => <Trans>Meja</Trans>,
        cell: ({ row }) => row.original.tableName ?? '—',
      },
      {
        id: 'status',
        enableSorting: false,
        header: () => <Trans>Status</Trans>,
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status];
          return <StatusBadge variant={meta.variant}>{meta.label}</StatusBadge>;
        },
      },
      {
        id: 'actions',
        enableSorting: false,
        header: () => null,
        cell: ({ row }) => {
          const r = row.original;
          const items: RowAction[] = [];
          if (r.status === 'booked') {
            items.push({
              label: <Trans>Duduk</Trans>,
              icon: <UserCheck />,
              onSelect: () => advanceStatus(r.id, 'seated', t`Tamu duduk.`),
            });
            items.push({
              label: <Trans context="reservation action">Batalkan</Trans>,
              icon: <XCircle />,
              onSelect: () => advanceStatus(r.id, 'cancelled', t`Reservasi dibatalkan.`),
            });
            items.push({
              label: <Trans>Tidak datang</Trans>,
              icon: <CircleSlash />,
              onSelect: () => advanceStatus(r.id, 'no_show', t`Ditandai tidak datang.`),
            });
          } else if (r.status === 'seated') {
            items.push({
              label: <Trans>Selesai</Trans>,
              icon: <Check />,
              onSelect: () => advanceStatus(r.id, 'completed', t`Reservasi selesai.`),
            });
          }
          items.push({
            label: <Trans>Ubah</Trans>,
            icon: <Pencil />,
            separatorBefore: items.length > 0,
            onSelect: () => openEdit(r),
          });
          items.push({
            label: <Trans>Hapus</Trans>,
            icon: <Trash2 />,
            destructive: true,
            onSelect: () => setRemoveTarget(r),
          });
          return (
            <div className="text-right">
              <RowActions label={t`Aksi baris`} items={items} />
            </div>
          );
        },
      },
    ],
    [t, advanceStatus, openEdit]
  );

  const emptyState = (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CalendarClock />
        </EmptyMedia>
        <EmptyTitle>
          <Trans>Belum ada reservasi.</Trans>
        </EmptyTitle>
        <EmptyDescription>
          <Trans>Buat reservasi untuk tanggal ini agar muncul di sini.</Trans>
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Reservasi</Trans>}
        actions={
          <Button type="button" onClick={openCreate}>
            <CalendarClock />
            <Trans>Buat reservasi</Trans>
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button type="button" size="sm" variant="outline">
              <CalendarDays />
              {dateLabel(day)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              defaultMonth={day}
              selected={day}
              onSelect={(next) => {
                if (next) {
                  setDay(next);
                  setCalendarOpen(false);
                }
              }}
            />
          </PopoverContent>
        </Popover>
        <Select value={status} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t`Semua`}</SelectItem>
            <SelectItem value="booked">
              {t({ message: 'Dipesan', context: 'reservation status' })}
            </SelectItem>
            <SelectItem value="seated">{t`Duduk`}</SelectItem>
            <SelectItem value="completed">{t`Selesai`}</SelectItem>
            <SelectItem value="cancelled">{t`Dibatalkan`}</SelectItem>
            <SelectItem value="no_show">{t`Tidak datang`}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <DataTable
        columns={columns}
        data={data?.rows}
        emptyState={emptyState}
        initialSort={[{ id: 'at', desc: false }]}
      />
      <ReservationFormDialog
        open={formOpen}
        editing={editing}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditing(null);
        }}
      />
      <ConfirmDialog
        open={removeTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRemoveTarget(null);
        }}
        title={<Trans>Hapus reservasi?</Trans>}
        description={
          removeTarget ? (
            <Trans>Reservasi "{removeTarget.customerName}" akan dihapus permanen.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Hapus</Trans>}
        destructive
        onConfirm={async () => {
          if (!removeTarget) return;
          try {
            await remove({ id: removeTarget.id });
            toast.success(t`Reservasi dihapus.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal menghapus reservasi.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </main>
  );
}
