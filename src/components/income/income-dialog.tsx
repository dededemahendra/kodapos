import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { useMutation } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export function IncomeDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const record = useMutation(api.otherIncome.record);

  const [source, setSource] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSource('');
      setAmount('');
      setNote('');
      setError(null);
    }
  }, [open]);

  const amountValue = Number.parseInt(amount, 10) || 0;
  const valid = source.trim().length > 0 && amountValue > 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !valid) return;
    setSubmitting(true);
    setError(null);
    try {
      await record({
        source: source.trim(),
        amountIDR: amountValue,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t`Pendapatan dicatat.`);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t`Gagal mencatat pendapatan.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Catat pendapatan</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="inc-source">
                <Trans>Sumber</Trans>
              </FieldLabel>
              <Input
                id="inc-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={60}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="inc-amount">
                <Trans>Jumlah (Rp)</Trans>
              </FieldLabel>
              <Input
                id="inc-amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="inc-note">
                <Trans>Catatan (opsional)</Trans>
              </FieldLabel>
              <Input
                id="inc-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting || !valid}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
