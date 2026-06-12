import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { useMutation } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import {
  EXPENSE_CATEGORY_OPTIONS,
  type ExpenseCategory,
} from '~/components/expenses/expense-categories';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export function ExpenseDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const record = useMutation(api.expenses.record);

  const [category, setCategory] = useState<ExpenseCategory>('rent');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCategory('rent');
      setAmount('');
      setNote('');
      setError(null);
    }
  }, [open]);

  const amountValue = Number.parseInt(amount, 10) || 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || amountValue <= 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await record({
        category,
        amountIDR: amountValue,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t`Pengeluaran dicatat.`);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t`Gagal mencatat pengeluaran.`;
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
            <Trans>Catat pengeluaran</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="exp-category">
                <Trans>Kategori</Trans>
              </FieldLabel>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as ExpenseCategory)}
              >
                <SelectTrigger id="exp-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-amount">
                <Trans>Jumlah</Trans>
              </FieldLabel>
              <Input
                id="exp-amount"
                type="number"
                min="1"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="exp-note">
                <Trans>Catatan (opsional)</Trans>
              </FieldLabel>
              <Input
                id="exp-note"
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
            <Button type="submit" disabled={submitting || amountValue <= 0}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
