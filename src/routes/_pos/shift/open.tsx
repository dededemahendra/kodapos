import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
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
  const { cashierId } = useActiveCashier();
  const current = useQuery(api.shifts.current, {});
  const staff = useQuery(api.staff.list, {});
  const openShift = useMutation(api.shifts.open);
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (current === undefined || staff === undefined) {
    return <p className="text-muted-foreground p-6">Memuat…</p>;
  }

  if (current) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Sudah ada shift terbuka</h1>
        <ShiftSummaryPanel shift={current} />
        <Button asChild>
          <Link to="/shift/close">Lanjut ke Tutup Shift</Link>
        </Button>
      </main>
    );
  }

  const me = staff.find((s) => s._id === cashierId);
  if (!me) {
    return (
      <p className="text-muted-foreground p-6">
        Kasir tidak dikenal.{' '}
        <Link to="/pin" className="underline">
          Pilih ulang
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
      setError(err instanceof Error ? err.message : 'Gagal membuka shift.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-md mx-auto p-6">
      <h1 className="text-2xl font-bold mb-1">Buka Shift</h1>
      <p className="text-muted-foreground text-sm mb-6">Sebagai: {me.name}</p>
      <form onSubmit={onSubmit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="openingFloatIDR">Modal awal (Rp)</FieldLabel>
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
            {submitting ? 'Membuka…' : 'Buka Shift'}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
