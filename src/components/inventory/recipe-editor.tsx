import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useMemo, useState } from 'react';
import { IngredientPicker } from '~/components/inventory/ingredient-picker';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { costPerCupIDR } from '~/lib/inventory';
import { formatIDR } from '~/lib/money';

type DraftLine = {
  key: string;
  ingredientId: Id<'ingredients'> | null;
  qty: string;
  wastageFactor: string;
};

function makeKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function RecipeEditor({ menuItemId }: { menuItemId: Id<'menuItems'> }) {
  const { t } = useLingui();
  const recipe = useQuery(api.recipes.getForItem, { menuItemId });
  const ingredients = useQuery(api.ingredients.list, {});
  const upsert = useMutation(api.recipes.upsert);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (recipe && recipe.lines.length > 0) {
      setLines(
        recipe.lines.map((l) => ({
          key: makeKey(),
          ingredientId: l.ingredient._id,
          qty: String(l.qty),
          wastageFactor: String(l.wastageFactor),
        }))
      );
    } else {
      setLines([]);
    }
  }, [recipe]);

  const ingredientsById = useMemo(() => {
    const map = new Map<Id<'ingredients'>, Doc<'ingredients'>>();
    for (const ing of ingredients ?? []) {
      map.set(ing._id, ing);
    }
    return map;
  }, [ingredients]);

  const costPreview = useMemo(() => {
    const validLines = lines
      .filter((l) => l.ingredientId !== null)
      .map((l) => ({
        ingredientId: l.ingredientId as Id<'ingredients'>,
        qty: Number.parseFloat(l.qty) || 0,
        wastageFactor: Number.parseFloat(l.wastageFactor) || 1.0,
      }));
    return costPerCupIDR(validLines, ingredientsById);
  }, [lines, ingredientsById]);

  function addLine() {
    setLines((prev) => [
      ...prev,
      { key: makeKey(), ingredientId: null, qty: '0', wastageFactor: '1.0' },
    ]);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function patchLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  async function save() {
    setSubmitting(true);
    setError(null);
    setSavedAt(null);
    try {
      const payload = lines
        .filter((l) => l.ingredientId !== null)
        .map((l) => ({
          ingredientId: l.ingredientId as Id<'ingredients'>,
          qty: Number.parseFloat(l.qty) || 0,
          wastageFactor: Number.parseFloat(l.wastageFactor) || 1.0,
        }));
      await upsert({ menuItemId, lines: payload });
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal menyimpan resep.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-10 pt-6 border-t border-border">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-bold"><Trans>Resep</Trans></h2>
        <span className="text-sm text-muted-foreground">
          ≈ <span className="font-semibold tabular-nums">{formatIDR(Math.round(costPreview))}</span>{' '}
          / <Trans>porsi</Trans>
        </span>
      </div>

      {recipe === undefined || ingredients === undefined ? (
        <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>
      ) : (
        <>
          {lines.length === 0 ? (
            <p className="text-muted-foreground text-sm mb-3">
              <Trans>Belum ada resep. Item tetap bisa dijual, tapi stok bahan tidak berkurang otomatis.</Trans>
            </p>
          ) : (
            <FieldGroup>
              {lines.map((line) => (
                <div key={line.key} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Field>
                      <FieldLabel><Trans>Bahan</Trans></FieldLabel>
                      <IngredientPicker
                        value={line.ingredientId}
                        onChange={(id) => patchLine(line.key, { ingredientId: id })}
                      />
                    </Field>
                  </div>
                  <div className="w-28">
                    <Field>
                      <FieldLabel htmlFor={`recipe-qty-${line.key}`}><Trans>Jumlah</Trans></FieldLabel>
                      <Input
                        id={`recipe-qty-${line.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.qty}
                        onChange={(e) => patchLine(line.key, { qty: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="w-24">
                    <Field>
                      <FieldLabel htmlFor={`recipe-wastage-${line.key}`}>Wastage</FieldLabel>
                      <Input
                        id={`recipe-wastage-${line.key}`}
                        type="number"
                        min="1"
                        max="5"
                        step="0.1"
                        value={line.wastageFactor}
                        onChange={(e) =>
                          patchLine(line.key, { wastageFactor: e.target.value })
                        }
                      />
                    </Field>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeLine(line.key)}
                    className="mb-1"
                    aria-label={t`Hapus baris`}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </FieldGroup>
          )}

          <div className="flex items-center gap-2 mt-4">
            <Button type="button" variant="outline" onClick={addLine}>
              + <Trans>Tambah bahan</Trans>
            </Button>
            <div className="ml-auto flex items-center gap-3">
              {savedAt ? <span className="text-xs text-primary"><Trans>Tersimpan.</Trans></span> : null}
              <Button type="button" onClick={save} disabled={submitting}>
                {submitting && <Spinner data-icon="inline-start" />}
                {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan resep</Trans>}
              </Button>
            </div>
          </div>
          {error && <FieldError>{error}</FieldError>}
        </>
      )}
    </section>
  );
}
