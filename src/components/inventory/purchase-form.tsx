import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
import { IngredientPicker } from '~/components/inventory/ingredient-picker';
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
import { formatIDR } from '~/lib/money';
import { purchaseTotalIDR } from '~/lib/purchase';
import { toast } from '~/lib/toast';

type DraftLine = {
  key: string;
  ingredientId: Id<'ingredients'> | null;
  qty: string;
  unitCostIDR: string;
};

function makeKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): DraftLine {
  return { key: makeKey(), ingredientId: null, qty: '', unitCostIDR: '' };
}

export function PurchaseForm({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const ingredients = useQuery(api.ingredients.list, {});
  const record = useMutation(api.purchases.record);
  const [supplier, setSupplier] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unitById = useMemo(() => {
    const m = new Map<Id<'ingredients'>, 'g' | 'ml' | 'piece'>();
    for (const ing of ingredients ?? []) m.set(ing._id, ing.canonicalUnit);
    return m;
  }, [ingredients]);

  // Complete, parsed lines for the live total + submit.
  const parsed = lines
    .map((l) => ({
      ingredientId: l.ingredientId,
      qty: Number.parseInt(l.qty, 10),
      unitCostIDR: Number.parseInt(l.unitCostIDR, 10),
    }))
    .filter(
      (l): l is { ingredientId: Id<'ingredients'>; qty: number; unitCostIDR: number } =>
        l.ingredientId !== null &&
        Number.isInteger(l.qty) &&
        l.qty > 0 &&
        Number.isInteger(l.unitCostIDR) &&
        l.unitCostIDR >= 0
    );
  const total = purchaseTotalIDR(parsed);

  function reset() {
    setSupplier('');
    setLines([emptyLine()]);
    setError(null);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    if (parsed.length === 0) {
      setError(t`Tambahkan minimal satu bahan dengan jumlah dan biaya.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await record({
        ...(supplier.trim() ? { supplierName: supplier.trim() } : {}),
        lines: parsed,
      });
      toast.success(t`Pembelian dicatat.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal mencatat pembelian.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            <Trans>Catat Pembelian</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supplier">
                <Trans>Pemasok (opsional)</Trans>
              </FieldLabel>
              <Input
                id="supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                maxLength={80}
              />
            </Field>
            <div className="space-y-3">
              {lines.map((line) => {
                const unit = line.ingredientId ? unitById.get(line.ingredientId) : null;
                return (
                  <div key={line.key} className="flex items-end gap-2">
                    <div className="flex-1">
                      <IngredientPicker
                        value={line.ingredientId}
                        onChange={(id) => updateLine(line.key, { ingredientId: id })}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder={unit ? t`Qty (${unit})` : t`Qty`}
                        value={line.qty}
                        onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                      />
                    </div>
                    <div className="w-28">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        placeholder={t`Biaya/satuan`}
                        value={line.unitCostIDR}
                        onChange={(e) => updateLine(line.key, { unitCostIDR: e.target.value })}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t`Hapus baris`}
                      onClick={() =>
                        setLines((prev) =>
                          prev.length > 1 ? prev.filter((l) => l.key !== line.key) : prev
                        )
                      }
                    >
                      <Trash2 />
                    </Button>
                  </div>
                );
              })}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                <Trans>+ Tambah bahan</Trans>
              </Button>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-sm">
              <span className="text-muted-foreground">
                <Trans>Total</Trans>
              </span>
              <span className="font-semibold tabular-nums">{formatIDR(total)}</span>
            </div>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                reset();
              }}
            >
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting || parsed.length === 0}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
