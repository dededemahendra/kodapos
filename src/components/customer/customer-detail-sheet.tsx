import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { nextTierFor, tierFor } from 'convex/lib/loyalty';
import { useMutation, useQuery } from 'convex/react';
import { Pencil, Receipt } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { CustomerFormDialog } from '~/components/customer/customer-form-dialog';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Field, FieldError, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '~/components/ui/sheet';
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { StatusBadge } from '~/components/ui/status-badge';
import type { StatusBadgeVariant } from '~/components/ui/status-badge-variant';
import { formatCount, formatDate, formatIDR } from '~/lib/formater';
import { toast } from '~/lib/toast';

type TxnType = 'earn' | 'redeem' | 'adjust';

function txnVariant(type: TxnType): StatusBadgeVariant {
  if (type === 'earn') return 'success';
  if (type === 'redeem') return 'warn';
  return 'muted';
}

export function CustomerDetailSheet({
  customerId,
  open,
  onOpenChange,
}: {
  customerId: Id<'customers'> | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const detail = useQuery(api.customers.getDetail, customerId ? { id: customerId } : 'skip');
  const loyaltyCfg = useQuery(api.loyalty.getConfig, {});
  const adjustPoints = useMutation(api.customers.adjustPoints);

  const [editOpen, setEditOpen] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAdjusting(false);
      setPoints('');
      setNote('');
      setError(null);
    }
  }, [open]);

  async function onAdjust(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !customerId) return;
    const parsed = Number(points);
    if (!Number.isInteger(parsed) || parsed === 0) {
      setError(t`Poin tidak valid.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await adjustPoints({ id: customerId, points: parsed, note });
      toast.success(t`Poin disesuaikan.`);
      setAdjusting(false);
      setPoints('');
      setNote('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyesuaikan poin.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{detail?.name ?? <Trans>Pelanggan</Trans>}</SheetTitle>
          <SheetDescription>{detail?.phone ?? ''}</SheetDescription>
        </SheetHeader>

        {detail === undefined ? (
          <div className="mt-4 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional and never reorder
              <Skeleton key={`skeleton-${i}`} className="h-8 w-full" />
            ))}
          </div>
        ) : detail === null ? (
          <p className="mt-4 text-sm text-muted-foreground">
            <Trans>Pelanggan tidak ditemukan.</Trans>
          </p>
        ) : (
          <div className="mt-4 text-sm">
            {(() => {
              const tier = tierFor(detail.totalSpentIDR, loyaltyCfg?.tiers);
              const next = nextTierFor(detail.totalSpentIDR, loyaltyCfg?.tiers);
              if (!tier && !next) return null;
              return (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  {tier ? (
                    <Badge variant="secondary">
                      <Trans>
                        {tier.name} · {tier.earnMultiplier}× poin
                      </Trans>
                    </Badge>
                  ) : null}
                  {next ? (
                    <span className="text-xs text-muted-foreground">
                      <Trans>
                        Rp {formatCount(next.minSpendIDR - detail.totalSpentIDR)} lagi ke{' '}
                        {next.name}
                      </Trans>
                    </span>
                  ) : null}
                </div>
              );
            })()}
            <div className="flex flex-wrap items-center gap-3">
              <Badge>
                <Trans>Saldo poin: {detail.pointsBalance}</Trans>
              </Badge>
              <span className="text-muted-foreground">
                <Trans>{detail.visitCount} kunjungan</Trans>
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatIDR(detail.totalSpentIDR)}
              </span>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAdjusting((v) => !v)}
              >
                <Trans>Sesuaikan poin</Trans>
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil />
                <Trans>Ubah</Trans>
              </Button>
            </div>

            {adjusting ? (
              <form onSubmit={onAdjust} className="mt-4 space-y-3 rounded-md border p-3">
                <Field>
                  <FieldLabel htmlFor="adjust-points">
                    <Trans>Poin (boleh negatif)</Trans>
                  </FieldLabel>
                  <Input
                    id="adjust-points"
                    type="number"
                    step={1}
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    required
                    autoFocus
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="adjust-note">
                    <Trans>Catatan</Trans>
                  </FieldLabel>
                  <Input id="adjust-note" value={note} onChange={(e) => setNote(e.target.value)} />
                </Field>
                {error ? <FieldError>{error}</FieldError> : null}
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAdjusting(false)}
                  >
                    <Trans>Batal</Trans>
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting && <Spinner data-icon="inline-start" />}
                    {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
                  </Button>
                </div>
              </form>
            ) : null}

            <h3 className="mt-6 mb-2 text-xs font-medium uppercase text-muted-foreground">
              <Trans>Riwayat poin</Trans>
            </h3>
            {detail.transactions.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Receipt />
                  </EmptyMedia>
                  <EmptyTitle>
                    <Trans>Belum ada transaksi poin.</Trans>
                  </EmptyTitle>
                </EmptyHeader>
              </Empty>
            ) : (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="py-2">
                        <Trans>Tanggal</Trans>
                      </th>
                      <th className="py-2">
                        <Trans>Tipe</Trans>
                      </th>
                      <th className="py-2 text-right">
                        <Trans>Poin</Trans>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.transactions.map((txn) => (
                      <tr key={txn._id} className="border-b border-border/50">
                        <td className="py-2 tabular-nums">
                          {formatDate(new Date(txn.at).toISOString(), 'day-month')}
                        </td>
                        <td className="py-2">
                          <StatusBadge variant={txnVariant(txn.type)}>
                            {txn.type === 'earn' ? (
                              <Trans>Perolehan</Trans>
                            ) : txn.type === 'redeem' ? (
                              <Trans>Penukaran</Trans>
                            ) : (
                              <Trans>Penyesuaian</Trans>
                            )}
                          </StatusBadge>
                          {txn.note ? (
                            <span className="ml-1 text-xs text-muted-foreground">{txn.note}</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {txn.points > 0 ? '+' : ''}
                          {txn.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {detail.truncated ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    <Trans>Menampilkan 100 transaksi terakhir.</Trans>
                  </p>
                ) : null}
              </>
            )}
          </div>
        )}

        <CustomerFormDialog
          open={editOpen}
          customer={detailToDoc(detail)}
          onOpenChange={setEditOpen}
        />
      </SheetContent>
    </Sheet>
  );
}

// getDetail returns the customer fields plus { transactions, truncated }; strip
// the extras to reuse the form dialog which expects a plain customers doc.
function detailToDoc(
  detail: (Doc<'customers'> & { transactions: unknown; truncated: boolean }) | null | undefined
): Doc<'customers'> | null {
  if (!detail) return null;
  const { transactions: _t, truncated: _tr, ...customer } = detail;
  return customer;
}
