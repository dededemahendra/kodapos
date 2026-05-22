import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { type ShiftSummary, ShiftSummaryPanel } from '~/components/shift/shift-summary-panel';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useActiveCashier } from '~/lib/active-cashier';

export const Route = createFileRoute('/_pos/shift/close')({
  component: ShiftClosePage,
});

function ShiftClosePage() {
  const current = useQuery(api.shifts.current, {});
  const closeShift = useMutation(api.shifts.close);
  const { clearCashier } = useActiveCashier();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closedShift, setClosedShift] = useState<ShiftSummary | null>(null);

  if (closedShift) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Shift ditutup</h1>
        <ShiftSummaryPanel shift={closedShift} />
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>Cetak ringkasan</Button>
          <Button variant="outline" asChild>
            <Link to="/menu">Kembali ke menu</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (current === undefined) {
    return <p className="text-fg-muted p-6">Memuat…</p>;
  }

  if (current === null) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <p className="text-fg-muted">Tidak ada shift terbuka.</p>
        <Button asChild className="mt-3">
          <Link to="/shift/open">Buka Shift Baru</Link>
        </Button>
      </main>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!current) return;
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const counted = Number(fd.get('countedCashIDR') ?? 0);
      await closeShift({ id: current._id, countedCashIDR: counted });
      setClosedShift({ ...current, countedCashIDR: counted, closedAt: Date.now() });
      clearCashier();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menutup shift.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 grid grid-cols-2 gap-8">
      <section>
        <h1 className="text-2xl font-bold mb-3">Tutup Shift</h1>
        <ShiftSummaryPanel shift={current} />
      </section>
      <section>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="countedCashIDR">Uang terhitung (Rp)</FieldLabel>
              <Input
                id="countedCashIDR"
                name="countedCashIDR"
                type="number"
                min="0"
                step="1000"
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? 'Menutup…' : 'Tutup Shift'}
            </Button>
          </FieldGroup>
        </form>
      </section>
    </main>
  );
}
