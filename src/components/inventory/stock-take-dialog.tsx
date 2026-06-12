import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { ClipboardList } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type Ingredient = Doc<'ingredients'> & { currentStockQty: number };

export function StockTakeDialog({
  open,
  ingredients,
  onOpenChange,
}: {
  open: boolean;
  ingredients: Ingredient[] | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const performStockTake = useMutation(api.ingredients.performStockTake);
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open && ingredients) {
      const seed: Record<string, string> = {};
      for (const r of ingredients) seed[r._id] = String(r.currentStockQty);
      setCounts(seed);
      setNote('');
    }
  }, [open, ingredients]);

  const changedCount = useMemo(() => {
    if (!ingredients) return 0;
    let n = 0;
    for (const r of ingredients) {
      const parsed = Number.parseInt(counts[r._id] ?? '', 10);
      const counted = Number.isNaN(parsed) ? 0 : parsed;
      if (counted !== r.currentStockQty) n += 1;
    }
    return n;
  }, [ingredients, counts]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!ingredients || submitting || changedCount === 0) return;
    setSubmitting(true);
    try {
      const payload = ingredients.map((r) => {
        const parsed = Number.parseInt(counts[r._id] ?? '', 10);
        return {
          ingredientId: r._id,
          countedQty: Number.isNaN(parsed) ? 0 : parsed,
        };
      });
      const res = await performStockTake({
        counts: payload,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast.success(t`Stok opname selesai · ${res.adjusted} bahan disesuaikan.`);
      onOpenChange(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t`Gagal menyimpan stok opname.`;
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const empty = ingredients !== undefined && ingredients.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>
            <Trans>Stok opname</Trans>
          </DialogTitle>
        </DialogHeader>

        {empty ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <ClipboardList />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Belum ada bahan untuk dihitung.</Trans>
              </EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <form onSubmit={onSubmit}>
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              <div className="grid grid-cols-[1fr_auto_6rem] items-center gap-2 px-1 text-muted-foreground text-xs">
                <span><Trans>Bahan</Trans></span>
                <span className="text-right"><Trans>Sistem</Trans></span>
                <span className="text-right"><Trans>Hitung fisik</Trans></span>
              </div>
              {ingredients?.map((r) => (
                <div
                  key={r._id}
                  className="grid grid-cols-[1fr_auto_6rem] items-center gap-2"
                >
                  <span className="truncate text-sm">{r.name}</span>
                  <span className="text-right text-muted-foreground text-sm tabular-nums">
                    {r.currentStockQty} {r.canonicalUnit}
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-label={t`Hitung fisik ${r.name}`}
                    value={counts[r._id] ?? ''}
                    onChange={(e) =>
                      setCounts((prev) => ({ ...prev, [r._id]: e.target.value }))
                    }
                    className="text-right tabular-nums"
                  />
                </div>
              ))}
            </div>

            <Field className="mt-3">
              <FieldLabel htmlFor="take-note">
                <Trans>Catatan (opsional)</Trans>
              </FieldLabel>
              <Input
                id="take-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
              />
            </Field>

            <DialogFooter className="mt-4 sm:items-center sm:justify-between">
              <span className="text-muted-foreground text-sm">
                <Trans>{changedCount} bahan akan disesuaikan</Trans>
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  <Trans>Batal</Trans>
                </Button>
                <Button type="submit" disabled={submitting || changedCount === 0}>
                  {submitting && <Spinner data-icon="inline-start" />}
                  {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
                </Button>
              </div>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
