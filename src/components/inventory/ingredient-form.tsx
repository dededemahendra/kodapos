import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
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

const UNIT_LABELS: Record<CanonicalUnit, string> = {
  g: 'Gram (g)',
  ml: 'Mililiter (ml)',
  piece: 'Buah (pcs)',
};

export function IngredientForm({
  open,
  ingredientId,
  onOpenChange,
}: {
  open: boolean;
  ingredientId: Id<'ingredients'> | null;
  onOpenChange: (open: boolean) => void;
}) {
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
      setError(err instanceof Error ? err.message : 'Gagal menyimpan bahan.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Ubah bahan' : 'Tambah bahan'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="ing-name">Nama</FieldLabel>
              <Input
                id="ing-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-unit">Satuan</FieldLabel>
              <Select value={unit} onValueChange={(v) => setUnit(v as CanonicalUnit)}>
                <SelectTrigger id="ing-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['g', 'ml', 'piece'] as CanonicalUnit[]).map((u) => (
                    <SelectItem key={u} value={u}>
                      {UNIT_LABELS[u]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="ing-threshold">Ambang isi ulang</FieldLabel>
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
              <FieldLabel htmlFor="ing-cost">Biaya per satuan (Rp)</FieldLabel>
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
                noun="bahan"
                name={existing?.name ?? ''}
                trigger={
                  <Button type="button" variant="ghost" className="text-muted-foreground mr-auto">
                    Arsipkan
                  </Button>
                }
                onConfirm={async () => {
                  await archive({ id: ingredientId });
                  onOpenChange(false);
                }}
              />
            ) : null}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
