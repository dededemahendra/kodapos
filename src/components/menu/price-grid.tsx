import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Search, UtensilsCrossed } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR, parseIDR } from '~/lib/money';
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
   *
   * Returns false when the input was rejected (invalid number), so the cell
   * can reset itself back to the stored value. Otherwise a rejected cell
   * keeps its invalid text and re-toasts on every subsequent blur.
   */
  async function commit(row: GridRow, raw: string): Promise<boolean> {
    const trimmed = raw.trim();
    if (trimmed === '') {
      if (row.overrideIDR === null) return true;
      try {
        await clearOverride({
          priceCategoryId: categoryId,
          targetKind: row.targetKind,
          targetId: row.targetId,
        });
      } catch {
        toast.error(t`Gagal menghapus harga.`);
        // A failed write leaves the query's stored value unchanged, so the
        // cell must revert itself too or it keeps showing text that was
        // never actually saved.
        return false;
      }
      return true;
    }
    // The standard price beside this cell renders with dot thousands
    // separators (formatIDR), so a bare Number() would silently misread a
    // pasted "45.000" as 45. parseIDR strips those separators first.
    let parsed: number;
    try {
      parsed = parseIDR(trimmed);
    } catch {
      toast.error(t`Harga harus bilangan bulat dan tidak boleh negatif.`);
      return false;
    }
    if (parsed === row.overrideIDR) return true;
    try {
      await setOverride({
        priceCategoryId: categoryId,
        targetKind: row.targetKind,
        targetId: row.targetId,
        priceIDR: parsed,
      });
    } catch {
      toast.error(t`Gagal menyimpan harga.`);
      return false;
    }
    return true;
  }

  if (rows === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UtensilsCrossed />
          </EmptyMedia>
          <EmptyTitle>
            <Trans>Belum ada item menu.</Trans>
          </EmptyTitle>
          <EmptyDescription>
            <Trans>
              Tambah item, varian, atau modifier di menu terlebih dahulu untuk memberinya harga
              di kategori ini.
            </Trans>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
      {visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Search />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Tidak ada hasil untuk pencarian ini.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>Coba kata kunci lain atau kosongkan kolom pencarian.</Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
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
                <td className="py-2 text-muted-foreground">{formatIDR(r.standardPriceIDR)}</td>
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
      )}
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
  onCommit: (raw: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(initial === null ? '' : String(initial));
  // Escape sets this so the blur it triggers does not write. `.blur()` fires
  // the native blur event synchronously, before React re-renders, so onBlur
  // would otherwise read the stale `value` from this render's closure (the
  // text the user typed, not the reset one) and commit it.
  const skipCommit = useRef(false);
  return (
    <Input
      value={value}
      type="number"
      inputMode="numeric"
      placeholder={placeholder}
      className="max-w-32"
      onChange={(e) => setValue(e.target.value)}
      onBlur={async () => {
        if (skipCommit.current) {
          skipCommit.current = false;
          return;
        }
        const ok = await onCommit(value);
        // Rejected input keeps the stored value visible instead of the
        // invalid text, so blurring again does not re-toast the same error.
        if (!ok) setValue(initial === null ? '' : String(initial));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        // Escape reverts the cell to its stored value without writing.
        if (e.key === 'Escape') {
          skipCommit.current = true;
          setValue(initial === null ? '' : String(initial));
          e.currentTarget.blur();
        }
      }}
    />
  );
}
