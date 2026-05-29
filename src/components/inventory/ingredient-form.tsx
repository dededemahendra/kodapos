import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { type FormEvent, useEffect, useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
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

type CanonicalUnit = 'g' | 'ml' | 'piece';

export function IngredientForm({
  open,
  ingredientId,
  onOpenChange,
}: {
  open: boolean;
  ingredientId: Id<'ingredients'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = ingredientId !== null;
  const existing = useQuery(
    api.ingredients.get,
    isEdit && ingredientId ? { id: ingredientId } : 'skip'
  );
  const upsert = useMutation(api.ingredients.upsert);
  const archive = useMutation(api.ingredients.archive);

  const [name, setName] = useState('');
  const [unit, setUnit] = useState<CanonicalUnit>('ml');
  const [reorderThreshold, setReorderThreshold] = useState<string>('0');
  const [lastCostPerUnitIDR, setLastCostPerUnitIDR] = useState<string>('0');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitLabels: Record<CanonicalUnit, string> = {
    g: t`Gram (g)`,
    ml: t`Mililiter (ml)`,
    piece: t`Buah (pcs)`,
  };

  useEffect(() => {
    if (open && existing) {
      setName(existing.name);
      setUnit(existing.canonicalUnit);
      setReorderThreshold(String(existing.reorderThreshold));
      setLastCostPerUnitIDR(String(existing.lastCostPerUnitIDR));
    } else if (open && !isEdit) {
      setName('');
      setUnit('ml');
      setReorderThreshold('0');
      setLastCostPerUnitIDR('0');
    }
    setError(null);
  }, [open, isEdit, existing]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await upsert({
        ...(ingredientId ? { id: ingredientId } : {}),
        name,
        canonicalUnit: unit,
        reorderThreshold: Number.parseInt(reorderThreshold, 10) || 0,
        lastCostPerUnitIDR: Number.parseInt(lastCostPerUnitIDR, 10) || 0,
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal menyimpan bahan.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? <Trans>Ubah bahan</Trans> : <Trans>Tambah bahan</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ing-name"><Trans>Nama</Trans></FieldLabel>
              <Input
                id="ing-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-unit"><Trans>Satuan</Trans></FieldLabel>
              <Select value={unit} onValueChange={(v) => setUnit(v as CanonicalUnit)}>
                <SelectTrigger id="ing-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['g', 'ml', 'piece'] as CanonicalUnit[]).map((u) => (
                    <SelectItem key={u} value={u}>
                      {unitLabels[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-threshold"><Trans>Ambang isi ulang</Trans></FieldLabel>
              <Input
                id="ing-threshold"
                type="number"
                min="0"
                step="1"
                value={reorderThreshold}
                onChange={(e) => setReorderThreshold(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-cost"><Trans>Biaya per satuan (Rp)</Trans></FieldLabel>
              <Input
                id="ing-cost"
                type="number"
                min="0"
                step="1"
                value={lastCostPerUnitIDR}
                onChange={(e) => setLastCostPerUnitIDR(e.target.value)}
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            {isEdit && ingredientId ? (
              <ConfirmArchive
                noun={t`bahan`}
                name={existing?.name ?? ''}
                trigger={
                  <Button type="button" variant="ghost" className="text-muted-foreground mr-auto">
                    <Trans>Arsipkan</Trans>
                  </Button>
                }
                onConfirm={async () => {
                  await archive({ id: ingredientId });
                  onOpenChange(false);
                }}
              />
            ) : null}
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
