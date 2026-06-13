import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import {
  type ShiftRow,
  ShiftFormDialog,
} from '~/components/schedule/shift-form-dialog';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { PageHeader } from '~/components/ui/page-header';
import { Spinner } from '~/components/ui/spinner';
import { useMutation } from 'convex/react';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/schedule')({
  component: SchedulePage,
});

// Local calendar date <-> 'YYYY-MM-DD' key (no timezone conversion).
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// The Monday (start) of the week that contains `d`, at local midnight.
function mondayOf(d: Date): Date {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = date.getDay(); // 0=Sun..6=Sat
  const diff = (dow + 6) % 7; // days since Monday
  date.setDate(date.getDate() - diff);
  return date;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function SchedulePage() {
  const { t, i18n } = useLingui();
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(new Date()));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftRow | null>(null);
  const [dialogDate, setDialogDate] = useState<string | undefined>(undefined);
  const [removing, setRemoving] = useState<ShiftRow | null>(null);

  const remove = useMutation(api.schedule.remove);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const from = toKey(days[0]!);
  const to = toKey(days[6]!);

  const data = useQuery(api.schedule.list, { from, to });

  const dateFmt = new Intl.DateTimeFormat(i18n.locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });

  function openCreate() {
    setEditing(null);
    setDialogDate(from);
    setDialogOpen(true);
  }

  function openCreateForDay(dayKey: string) {
    setEditing(null);
    setDialogDate(dayKey);
    setDialogOpen(true);
  }

  function openEdit(shift: ShiftRow) {
    setEditing(shift);
    setDialogDate(undefined);
    setDialogOpen(true);
  }

  async function handleRemove() {
    if (!removing) return;
    try {
      await remove({ id: removing.id });
      toast.success(t`Jadwal dihapus.`);
      setRemoving(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menghapus jadwal.`);
      throw err;
    }
  }

  const shifts = data?.rows ?? [];
  const byDay = new Map<string, ShiftRow[]>();
  for (const s of shifts) {
    const arr = byDay.get(s.date) ?? [];
    arr.push(s);
    byDay.set(s.date, arr);
  }

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Jadwal</Trans>}
        actions={
          <Button type="button" onClick={openCreate}>
            <Trans>Tambah jadwal</Trans>
          </Button>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label={t`Minggu sebelumnya`}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label={t`Minggu berikutnya`}
        >
          <ChevronRight className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setWeekStart(mondayOf(new Date()))}
        >
          <Trans>Minggu ini</Trans>
        </Button>
        <span className="text-sm text-muted-foreground">
          {dateFmt.format(days[0]!)} s/d {dateFmt.format(days[6]!)}
        </span>
      </div>

      <div className="mt-6">
        {data === undefined ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : shifts.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarDays />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Belum ada jadwal minggu ini.</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>
                  Tambahkan jadwal kerja staf untuk minggu yang dipilih.
                </Trans>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-6">
            {days.map((day) => {
              const key = toKey(day);
              const dayShifts = byDay.get(key) ?? [];
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center justify-between gap-2 border-b border-border pb-1">
                    <h2 className="text-sm font-semibold">
                      {dateFmt.format(day)}
                    </h2>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => openCreateForDay(key)}
                    >
                      <Trans>Tambah jadwal</Trans>
                    </Button>
                  </div>
                  {dayShifts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      <Trans>Tidak ada jadwal.</Trans>
                    </p>
                  ) : (
                    dayShifts.map((shift) => (
                      <div
                        key={shift.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3 text-card-foreground"
                      >
                        <div className="min-w-0">
                          <span className="font-medium">{shift.staffName}</span>
                          <span className="ml-2 text-sm tabular-nums text-muted-foreground">
                            {shift.startTime} s/d {shift.endTime}
                          </span>
                          {shift.note && (
                            <p className="truncate text-xs text-muted-foreground">
                              {shift.note}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(shift)}
                          >
                            <Trans>Ubah</Trans>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setRemoving(shift)}
                          >
                            <Trans>Hapus</Trans>
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ShiftFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        defaultDate={dialogDate}
      />

      <ConfirmDialog
        open={removing != null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={<Trans>Hapus jadwal?</Trans>}
        description={<Trans>Jadwal ini akan dihapus permanen.</Trans>}
        confirmLabel={<Trans>Hapus</Trans>}
        destructive
        onConfirm={handleRemove}
      />
    </main>
  );
}
