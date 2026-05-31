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
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

// Raw enum values match convex/waste.ts; labels are translated at render time.
const REASONS = ['rusak', 'basi', 'tumpah', 'salah_masak', 'lainnya'] as const;
type WasteReason = (typeof REASONS)[number];

export function WasteDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const ingredients = useQuery(api.ingredients.list, {});
  const record = useMutation(api.waste.record);

  const reasonLabels: Record<WasteReason, string> = {
    rusak: t`Rusak`,
    basi: t`Basi/Kedaluwarsa`,
    tumpah: t`Tumpah`,
    salah_masak: t`Salah masak`,
    lainnya: t`Lainnya`,
  };

  const [ingredientId, setIngredientId] = useState<string>('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState<WasteReason>(REASONS[0]);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setIngredientId('');
      setQty('');
      setReason(REASONS[0]);
      setNote('');
      setError(null);
    }
  }, [open]);

  const selected = ingredients?.find((i) => i._id === ingredientId);
  const qtyNum = Number.parseInt(qty, 10) || 0;
  const estLoss = selected ? qtyNum * selected.lastCostPerUnitIDR : 0;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ingredientId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await record({
        ingredientId: ingredientId as Id<'ingredients'>,
        qtyWasted: qtyNum,
        wasteReason: reason,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t`Limbah dicatat.`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal mencatat limbah.`;
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
            <Trans>Catat limbah</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="waste-ingredient">
                <Trans>Bahan</Trans>
              </FieldLabel>
              <Select value={ingredientId} onValueChange={setIngredientId}>
                <SelectTrigger id="waste-ingredient">
                  <SelectValue placeholder={t`Pilih bahan`} />
                </SelectTrigger>
                <SelectContent>
                  {ingredients?.map((i) => (
                    <SelectItem key={i._id} value={i._id}>
                      {i.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {selected && (
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <Trans>Stok saat ini:</Trans>{' '}
                <span className="font-semibold tabular-nums">
                  {selected.currentStockQty} {selected.canonicalUnit}
                </span>
              </div>
            )}
            <Field>
              <FieldLabel htmlFor="waste-qty">
                <Trans>Jumlah dibuang</Trans>
                {selected ? ` (${selected.canonicalUnit})` : ''}
              </FieldLabel>
              <Input
                id="waste-qty"
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="waste-reason">
                <Trans>Alasan</Trans>
              </FieldLabel>
              <Select value={reason} onValueChange={(v) => setReason(v as WasteReason)}>
                <SelectTrigger id="waste-reason">
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
              <FieldLabel htmlFor="waste-note">
                <Trans>Catatan (opsional)</Trans>
              </FieldLabel>
              <Input
                id="waste-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>
            {selected && qtyNum > 0 && (
              <div className="text-sm text-muted-foreground">
                <Trans>Perkiraan kerugian:</Trans>{' '}
                <span className="font-semibold tabular-nums">{formatIDR(estLoss)}</span>
              </div>
            )}
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting || !ingredientId}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
