import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Trash2 } from 'lucide-react';
import { type FormEvent, useMemo, useState } from 'react';
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

const NO_SUPPLIER = '__none__';

type DraftLine = {
  key: string;
  ingredientId: Id<'ingredients'> | null;
  orderedQty: string;
  unitCostIDR: string;
};

function makeKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function emptyLine(): DraftLine {
  return { key: makeKey(), ingredientId: null, orderedQty: '', unitCostIDR: '' };
}

export function PurchaseOrderFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const suppliers = useQuery(api.suppliers.list, {});
  const ingredients = useQuery(api.ingredients.list, {});
  const create = useMutation(api.purchaseOrders.create);
  const [supplierId, setSupplierId] = useState<string>(NO_SUPPLIER);
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Complete, parsed lines for the live total + submit.
  const parsed = lines
    .map((l) => ({
      ingredientId: l.ingredientId,
      orderedQty: Number.parseInt(l.orderedQty, 10),
      unitCostIDR: Number.parseInt(l.unitCostIDR, 10),
    }))
    .filter(
      (l): l is { ingredientId: Id<'ingredients'>; orderedQty: number; unitCostIDR: number } =>
        l.ingredientId !== null &&
        Number.isInteger(l.orderedQty) &&
        l.orderedQty > 0 &&
        Number.isInteger(l.unitCostIDR) &&
        l.unitCostIDR >= 0
    );
  const total = useMemo(
    () => parsed.reduce((sum, l) => sum + l.orderedQty * l.unitCostIDR, 0),
    [parsed]
  );

  function reset() {
    setSupplierId(NO_SUPPLIER);
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
      await create({
        ...(supplierId !== NO_SUPPLIER
          ? { supplierId: supplierId as Id<'suppliers'> }
          : {}),
        lines: parsed,
      });
      toast.success(t`Pesanan beli dibuat.`);
      reset();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal membuat pesanan beli.`;
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
            <Trans>Buat PO</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="po-supplier">
                <Trans>Pemasok (opsional)</Trans>
              </FieldLabel>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger id="po-supplier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SUPPLIER}>
                    <Trans>Tanpa pemasok</Trans>
                  </SelectItem>
                  {(suppliers ?? []).map((s) => (
                    <SelectItem key={s._id} value={s._id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="space-y-3">
              {lines.map((line) => {
                const unit = line.ingredientId
                  ? (ingredients ?? []).find((i) => i._id === line.ingredientId)?.canonicalUnit
                  : null;
                return (
                  <div key={line.key} className="flex items-end gap-2">
                    <div className="flex-1">
                      <Select
                        value={line.ingredientId ?? ''}
                        onValueChange={(id) =>
                          updateLine(line.key, { ingredientId: id as Id<'ingredients'> })
                        }
                      >
                        <SelectTrigger aria-label={t`Bahan`}>
                          <SelectValue placeholder={t`Pilih bahan…`} />
                        </SelectTrigger>
                        <SelectContent>
                          {(ingredients ?? []).map((ing) => (
                            <SelectItem key={ing._id} value={ing._id}>
                              {ing.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        placeholder={unit ? t`Qty (${unit})` : t`Qty`}
                        value={line.orderedQty}
                        onChange={(e) => updateLine(line.key, { orderedQty: e.target.value })}
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
                <Trans>+ Tambah baris</Trans>
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
