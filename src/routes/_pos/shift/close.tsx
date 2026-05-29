import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
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
  const { t } = useLingui();
  const current = useQuery(api.shifts.current, {});
  const closeShift = useMutation(api.shifts.close);
  const { clearCashier } = useActiveCashier();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [closedShift, setClosedShift] = useState<ShiftSummary | null>(null);

  if (closedShift) {
    return (
      <main className="max-w-xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold"><Trans>Shift ditutup</Trans></h1>
        <ShiftSummaryPanel shift={closedShift} />
        <div className="flex gap-2">
          <Button onClick={() => window.print()}><Trans>Cetak ringkasan</Trans></Button>
          <Button variant="outline" asChild>
            <Link to="/menu"><Trans>Kembali ke menu</Trans></Link>
          </Button>
        </div>
      </main>
    );
  }

  if (current === undefined) {
    return <p className="text-muted-foreground p-6"><Trans>Memuat…</Trans></p>;
  }

  if (current === null) {
    return (
      <main className="max-w-xl mx-auto p-6">
        <p className="text-muted-foreground"><Trans>Tidak ada shift terbuka.</Trans></p>
        <Button asChild className="mt-3">
          <Link to="/shift/open"><Trans>Buka Shift Baru</Trans></Link>
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
      setError(err instanceof Error ? err.message : t`Gagal menutup shift.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="max-w-3xl mx-auto p-6 grid grid-cols-2 gap-8">
      <section>
        <h1 className="text-2xl font-bold mb-3"><Trans>Tutup Shift</Trans></h1>
        <ShiftSummaryPanel shift={current} />
      </section>
      <section>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="countedCashIDR"><Trans>Uang terhitung (Rp)</Trans></FieldLabel>
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
              {submitting ? <Trans>Menutup…</Trans> : <Trans>Tutup Shift</Trans>}
            </Button>
          </FieldGroup>
        </form>
      </section>
    </main>
  );
}
