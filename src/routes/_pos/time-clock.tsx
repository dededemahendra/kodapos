import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Clock } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { DataTable } from '~/components/ui/data-table';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { downloadCSV, toCSV } from '~/lib/csv';
import { usePermissions } from '~/lib/permissions';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/time-clock')({
  component: TimeClockPage,
});

type Preset = 'today' | 'last7' | 'last30';

function formatMinutes(m: number) {
  return `${Math.floor(m / 60)}j ${m % 60}m`;
}

function TimeClockPage() {
  return (
    <main className="p-6">
      <PageHeader title={<Trans>Jam Kerja</Trans>} />
      <div className="space-y-8">
        <ClockSection />
        <ReportSection />
      </div>
    </main>
  );
}

function ClockSection() {
  const { t } = useLingui();
  const staff = useQuery(api.staff.list, {});
  const inNow = useQuery(api.timeClock.currentlyIn, {});
  const clockIn = useMutation(api.timeClock.clockIn);
  const clockOut = useMutation(api.timeClock.clockOut);

  if (staff === undefined || inNow === undefined) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const inByCashier = new Map(inNow.map((r) => [r.cashierId, r] as const));
  const active = staff.filter((s) => !s.archived);

  async function onClockIn(cashierId: Id<'cafeStaff'>) {
    try {
      await clockIn({ cashierId });
      toast.success(t`Berhasil clock in.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal clock in.`);
    }
  }

  async function onClockOut(cashierId: Id<'cafeStaff'>) {
    try {
      await clockOut({ cashierId });
      toast.success(t`Berhasil clock out.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal clock out.`);
    }
  }

  return (
    <div className="space-y-2">
      {active.map((s) => {
        const open = inByCashier.get(s._id);
        return (
          <div
            key={s._id}
            className="flex items-center justify-between gap-4 rounded-lg border bg-card p-4 text-card-foreground"
          >
            <span className="truncate font-medium">{s.name}</span>
            {open ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  <Trans>
                    Masuk sejak{' '}
                    {new Date(open.clockInAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Trans>
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onClockOut(s._id)}
                >
                  <Trans>Clock out</Trans>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  <Trans>Belum masuk</Trans>
                </span>
                <Button type="button" onClick={() => onClockIn(s._id)}>
                  <Trans>Clock in</Trans>
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type ReportRow = {
  cashierName: string;
  sessionCount: number;
  totalMinutes: number;
};

function ReportSection() {
  const { isOwner } = usePermissions();
  const { t } = useLingui();
  const [preset, setPreset] = useState<Preset>('last7');
  const report = useQuery(api.timeClock.report, { range: { preset } });

  const columns = useMemo<ColumnDef<ReportRow, unknown>[]>(
    () => [
      {
        accessorKey: 'cashierName',
        header: () => <Trans>Staf</Trans>,
        cell: ({ row }) => <span>{row.original.cashierName}</span>,
      },
      {
        accessorKey: 'sessionCount',
        header: () => <Trans>Sesi</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.sessionCount}</span>
        ),
      },
      {
        accessorKey: 'totalMinutes',
        header: () => <Trans>Jam</Trans>,
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatMinutes(row.original.totalMinutes)}
          </span>
        ),
      },
    ],
    []
  );

  if (!isOwner) return null;

  function exportCSV() {
    if (!report) return;
    const csv = toCSV(
      report.rows.map((r) => ({
        staff: r.cashierName,
        sessions: r.sessionCount,
        minutes: r.totalMinutes,
      })),
      [
        { key: 'staff', header: t`Staf` },
        { key: 'sessions', header: t`Sesi` },
        { key: 'minutes', header: t`Jam` },
      ]
    );
    downloadCSV('jam-kerja.csv', csv);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">
              <Trans>Hari ini</Trans>
            </SelectItem>
            <SelectItem value="last7">
              <Trans>7 hari</Trans>
            </SelectItem>
            <SelectItem value="last30">
              <Trans>30 hari</Trans>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportCSV}
          disabled={!report || report.rows.length === 0}
        >
          <Trans>Unduh CSV</Trans>
        </Button>
      </div>

      {report === undefined ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : report.rows.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Clock />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada jam kerja pada rentang ini.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Coba pilih rentang lain.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <DataTable columns={columns} data={report.rows} emptyState={null} />
          <div className="text-sm">
            <Trans>Total</Trans>:{' '}
            <span className="font-semibold tabular-nums">
              {formatMinutes(report.totalMinutes)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
