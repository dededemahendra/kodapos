import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

/**
 * The row shape `api.menu.priceOverrides.grid` returns. Derived from the query so
 * targetId keeps its union id type and no cast is needed when passing it back to
 * set/clear.
 */
type GridRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.menu.priceOverrides.grid>>
>[number];

export function PriceGrid({ categoryId }: { categoryId: Id<'priceCategories'> }) {
  const { t } = useLingui();
  const rows = useQuery(api.menu.priceOverrides.grid, { priceCategoryId: categoryId });
  const setOverride = useMutation(api.menu.priceOverrides.set);
  const clearOverride = useMutation(api.menu.priceOverrides.clear);
  const [search, setSearch] = useState('');

  /**
   * Writes fire on blur, never per keystroke. Typing "45000" would otherwise
   * send five mutations, four of them for prices nobody meant.
   */
  async function commit(row: GridRow, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (row.overrideIDR === null) return;
      try {
        await clearOverride({
          priceCategoryId: categoryId,
          targetKind: row.targetKind,
          targetId: row.targetId,
        });
      } catch {
        toast.error(t`Gagal menghapus harga.`);
      }
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.error(t`Harga harus bilangan bulat dan tidak boleh negatif.`);
      return;
    }
    if (parsed === row.overrideIDR) return;
    try {
      await setOverride({
        priceCategoryId: categoryId,
        targetKind: row.targetKind,
        targetId: row.targetId,
        priceIDR: parsed,
      });
    } catch {
      toast.error(t`Gagal menyimpan harga.`);
    }
  }

  if (rows === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const visible = term
    ? rows.filter(
        (r) =>
          r.label.toLowerCase().includes(term) ||
          (r.groupLabel ?? '').toLowerCase().includes(term)
      )
    : rows;

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t`Cari menu, varian atau tambahan`}
        className="max-w-sm"
      />
      <p className="text-sm text-muted-foreground">
        <Trans>Kosongkan kolom harga untuk memakai harga standar.</Trans>
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="py-2 font-medium">
              <Trans>Nama</Trans>
            </th>
            <th className="py-2 font-medium">
              <Trans>Harga standar</Trans>
            </th>
            <th className="py-2 font-medium">
              <Trans>Harga kategori</Trans>
            </th>
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.targetId} className="border-b border-border">
              <td className="py-2">
                {r.groupLabel ? (
                  <span className="text-muted-foreground">{r.groupLabel} / </span>
                ) : null}
                {r.label}
              </td>
              <td className="py-2 text-muted-foreground">{r.standardPriceIDR}</td>
              <td className="py-2">
                <PriceCell
                  key={`${r.targetId}:${r.overrideIDR ?? 'null'}`}
                  initial={r.overrideIDR}
                  placeholder={String(r.standardPriceIDR)}
                  onCommit={(raw) => commit(r, raw)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceCell({
  initial,
  placeholder,
  onCommit,
}: {
  initial: number | null;
  placeholder: string;
  onCommit: (raw: string) => void;
}) {
  const [value, setValue] = useState(initial === null ? '' : String(initial));
  return (
    <Input
      value={value}
      inputMode="numeric"
      placeholder={placeholder}
      className="max-w-32"
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        // Escape reverts the cell to its stored value without writing.
        if (e.key === 'Escape') {
          setValue(initial === null ? '' : String(initial));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
