import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { type FormEvent, useState } from 'react';
import { ShiftSummaryPanel } from '~/components/shift/shift-summary-panel';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useActiveCashier } from '~/lib/active-cashier';

export const Route = createFileRoute('/_pos/shift/open')({
  component: ShiftOpenPage,
});

function ShiftOpenPage() {
  const { t } = useLingui();
  const { cashierId } = useActiveCashier();
  const current = useQuery(api.shifts.current, {});
  const staff = useQuery(api.staff.list, {});
  const openShift = useMutation(api.shifts.open);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (current === undefined || staff === undefined) {
    return <p className="text-muted-foreground p-6"><Trans>Memuat…</Trans></p>;
  }

  if (current) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold"><Trans>Sudah ada shift terbuka</Trans></h1>
        <ShiftSummaryPanel shift={current} />
        <Button asChild>
          <Link to="/shift/close"><Trans>Lanjut ke Tutup Shift</Trans></Link>
        </Button>
      </main>
    );
  }

  const me = staff.find((s) => s._id === cashierId);
  if (!me) {
    return (
      <p className="text-muted-foreground p-6">
        <Trans>Kasir tidak dikenal.</Trans>{' '}
        <Link to="/pin" className="underline">
          <Trans>Pilih ulang</Trans>
        </Link>
        .
      </p>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cashierId) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await openShift({
        cashierId,
        openingFloatIDR: Number(fd.get('openingFloatIDR') ?? 0),
      });
      navigate({ to: '/shift/close' });
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal membuka shift.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1"><Trans>Buka Shift</Trans></h1>
      <p className="text-muted-foreground text-sm mb-6"><Trans>Sebagai: {me.name}</Trans></p>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="openingFloatIDR"><Trans>Modal awal (Rp)</Trans></FieldLabel>
            <Input
              id="openingFloatIDR"
              name="openingFloatIDR"
              type="number"
              min="0"
              step="1000"
              defaultValue={0}
              required
            />
          </Field>
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? <Trans>Membuka…</Trans> : <Trans>Buka Shift</Trans>}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
