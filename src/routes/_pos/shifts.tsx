import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useAction, usePaginatedQuery, useQuery } from 'convex/react';
import { History, Mail } from 'lucide-react';
import { useState } from 'react';
import { PinGate } from '~/components/staff/pin-gate';
import { ShiftOrderList } from '~/components/shift/shift-order-list';
import { Button } from '~/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover';
import { ListSkeleton } from '~/components/ui/loading-skeletons';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/shifts')({
  component: ShiftsPage,
});

function ShiftsPage() {
  return (
    <RequirePermission perm="canViewReports">
      <PinGate>
        <ShiftHistoryPage />
      </PinGate>
    </RequirePermission>
  );
}

function formatDuration(ms: number): string {
  const mins = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}j ${m}m` : `${m}m`;
}

/** Per-row "Email ringkasan" control: a popover with an email input + Kirim. */
function EmailSummaryButton({
  shiftId,
  defaultEmail,
}: {
  shiftId: Id<'shifts'>;
  defaultEmail: string;
}) {
  const { t } = useLingui();
  const send = useAction(api.email.sendShiftSummary);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const to = email.trim();
    if (!to) return;
    setSending(true);
    try {
      await send({ shiftId, to });
      toast.success(t`Ringkasan dikirim.`);
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal mengirim ringkasan.`);
    } finally {
      setSending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Mail className="size-3.5" />
          <Trans>Email ringkasan</Trans>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2">
        <Label htmlFor={`summary-email-${shiftId}`} className="text-xs">
          <Trans>Email penerima ringkasan</Trans>
        </Label>
        <Input
          id={`summary-email-${shiftId}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@contoh.com"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          className="w-full"
          disabled={sending || email.trim().length === 0}
          onClick={handleSend}
        >
          {sending && <Spinner data-icon="inline-start" />}
          <Trans>Kirim</Trans>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function ShiftHistoryPage() {
  const { t } = useLingui();
  const open = useQuery(api.shifts.current, {});
  const settings = useQuery(api.settings.get);
  const summaryEmail = settings?.notifications?.summaryEmail ?? '';
  const { results, status, loadMore } = usePaginatedQuery(
    api.shifts.listClosed,
    {},
    { initialNumItems: 20 }
  );
  const [selected, setSelected] = useState<Id<'shifts'> | null>(null);
  const sessions = useQuery(api.cashierSessions.listForShift, selected ? { shiftId: selected } : 'skip');

  if (selected) {
    return (
      <main className="p-6 space-y-3">
        <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
          <Trans>← Kembali ke daftar shift</Trans>
        </Button>
        {sessions && sessions.length > 0 ? (
          <div className="rounded-md border border-border p-3">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2"><Trans>Riwayat kasir</Trans></div>
            <ul className="text-sm space-y-1">
              {sessions.map((s) => (
                <li key={s._id} className="flex justify-between">
                  <span>{s.cashierName} · {s.type === 'login' ? <Trans>Masuk</Trans> : s.type === 'switch' ? <Trans>Ganti</Trans> : <Trans>Keluar</Trans>}</span>
                  <span className="text-muted-foreground tabular-nums">{new Date(s.at).toLocaleTimeString('id-ID')}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <ShiftOrderList shiftId={selected} />
      </main>
    );
  }

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-2xl font-bold"><Trans>Riwayat Shift</Trans></h1>

      {open ? (
        <div className="rounded-md border border-border p-3 bg-muted/40">
          <div className="flex justify-between">
            <span className="text-sm font-medium"><Trans>Sedang berjalan</Trans></span>
            <span className="text-xs text-muted-foreground">
              {new Date(open.openedAt).toLocaleString('id-ID')}
            </span>
          </div>
        </div>
      ) : null}

      {status === 'LoadingFirstPage' ? (
        <ListSkeleton rows={5} />
      ) : results.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><History /></EmptyMedia>
            <EmptyTitle><Trans>Belum ada shift yang ditutup.</Trans></EmptyTitle>
            <EmptyDescription><Trans>Shift akan muncul di sini setelah ditutup.</Trans></EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {results.map((s) => (
            <li key={s._id} className="flex items-start gap-2 p-3 hover:bg-muted">
              <button type="button" onClick={() => setSelected(s._id)} className="flex-1 min-w-0 text-left">
                <div className="flex justify-between">
                  <span className="text-sm font-medium">{s.cashierName}</span>
                  <span className="text-sm font-semibold tabular-nums">{formatIDR(s.salesTotalIDR)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.openedAt).toLocaleString('id-ID')} → {new Date(s.closedAt).toLocaleTimeString('id-ID')}
                  {' · '}{formatDuration(s.closedAt - s.openedAt)}
                  {' · '}{t`${s.ordersCount} pesanan`}
                </div>
                <div className="text-xs mt-1 flex gap-3">
                  <span className="text-muted-foreground"><Trans>Kas dihitung</Trans>: {s.countedCashIDR !== null ? formatIDR(s.countedCashIDR) : '—'}</span>
                  {s.varianceIDR !== null ? (
                    <span className={s.varianceIDR === 0 ? 'text-muted-foreground' : s.varianceIDR > 0 ? 'text-emerald-600' : 'text-red-600'}>
                      <Trans>Selisih</Trans>: {s.varianceIDR > 0 ? `+${formatIDR(s.varianceIDR)}` : formatIDR(s.varianceIDR)}
                      {' '}{s.varianceIDR > 0 ? <Trans>(Lebih)</Trans> : s.varianceIDR < 0 ? <Trans>(Kurang)</Trans> : null}
                    </span>
                  ) : null}
                </div>
              </button>
              <div className="shrink-0">
                <EmailSummaryButton key={summaryEmail} shiftId={s._id} defaultEmail={summaryEmail} />
              </div>
            </li>
          ))}
        </ul>
      )}

      {status === 'CanLoadMore' ? (
        <Button variant="outline" size="sm" onClick={() => loadMore(20)}>
          <Trans>Muat lebih banyak</Trans>
        </Button>
      ) : null}
    </main>
  );
}
