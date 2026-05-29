import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Trans, useLingui } from '@lingui/react/macro';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';

const REASONS = ['Pengiriman masuk', 'Stok opname', 'Limbah', 'Koreksi'] as const;

export function StockAdjustDialog({
  open,
  ingredientId,
  onOpenChange,
}: {
  open: boolean;
  ingredientId: Id<'ingredients'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const ingredient = useQuery(
    api.ingredients.get,
    ingredientId ? { id: ingredientId } : 'skip'
  );
  const adjustStock = useMutation(api.ingredients.adjustStock);

  // Reason labels keyed by the raw DB value so the value prop stays untranslated.
  const reasonLabels: Record<typeof REASONS[number], string> = {
    'Pengiriman masuk': t`Pengiriman masuk`,
    'Stok opname': t`Stok opname`,
    'Limbah': t`Limbah`,
    'Koreksi': t`Koreksi`,
  };

  const [newQty, setNewQty] = useState('');
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && ingredient) {
      setNewQty(String(ingredient.currentStockQty));
      setReason(REASONS[0]);
      setNote('');
      setError(null);
    }
  }, [open, ingredient]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ingredientId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await adjustStock({
        ingredientId,
        newQty: Number.parseInt(newQty, 10) || 0,
        reasonLabel: reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal mencatat stok.`);
    } finally {
      setSubmitting(false);
    }
  }

  if (!ingredient && open) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Catat stok:</Trans> {ingredient?.name}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <div className="rounded-md bg-muted px-3 py-2 text-sm">
              <Trans>Stok saat ini:</Trans>{' '}
              <span className="font-semibold tabular-nums">
                {ingredient?.currentStockQty} {ingredient?.canonicalUnit}
              </span>
            </div>
            <Field>
              <FieldLabel htmlFor="adj-qty">
                <Trans>Stok baru</Trans> ({ingredient?.canonicalUnit})
              </FieldLabel>
              <Input
                id="adj-qty"
                type="number"
                min="0"
                step="1"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="adj-reason"><Trans>Alasan</Trans></FieldLabel>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger id="adj-reason">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REASONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {reasonLabels[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="adj-note"><Trans>Catatan (opsional)</Trans></FieldLabel>
              <Input
                id="adj-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
