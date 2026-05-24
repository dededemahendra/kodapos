import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useMemo, useRef, useState } from 'react';
import { Input } from '~/components/ui/input';

export function IngredientPicker({
  value,
  onChange,
  onRequestCreate,
}: {
  value: Id<'ingredients'> | null;
  onChange: (id: Id<'ingredients'>) => void;
  onRequestCreate?: (initialName: string) => void;
}) {
  const ingredients = useQuery(api.ingredients.list, {});
  const [search, setSearch] = useState('');
  const [focused, setFocused] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selected = useMemo(() => {
    if (!ingredients || !value) return null;
    return ingredients.find((i) => i._id === value) ?? null;
  }, [ingredients, value]);

  const matches = useMemo(() => {
    if (!ingredients) return [];
    const q = search.toLowerCase();
    return (q ? ingredients.filter((i) => i.name.toLowerCase().includes(q)) : ingredients).slice(
      0,
      8
    );
  }, [ingredients, search]);

  const showList = focused && (search.length > 0 || !value);

  return (
    <div className="relative">
      <Input
        value={search || (selected?.name ?? '')}
        placeholder="Pilih bahan…"
        onChange={(e) => {
          setSearch(e.target.value);
        }}
        onFocus={() => {
          if (blurTimer.current) clearTimeout(blurTimer.current);
          setFocused(true);
        }}
        onBlur={() => {
          // Delay so onMouseDown of a list item still fires.
          blurTimer.current = setTimeout(() => setFocused(false), 150);
        }}
      />
      {showList ? (
        <ul className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-md border border-border bg-bg shadow-md">
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">Tidak ada bahan cocok.</li>
          ) : (
            matches.map((ing) => (
              <li key={ing._id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-surface"
                  onMouseDown={() => {
                    onChange(ing._id);
                    setSearch('');
                    setFocused(false);
                  }}
                >
                  {ing.name}{' '}
                  <span className="text-fg-muted text-xs">
                    ({ing.currentStockQty} {ing.canonicalUnit})
                  </span>
                </button>
              </li>
            ))
          )}
          {onRequestCreate && search.trim() ? (
            <li className="border-t border-border">
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm text-brand-700 hover:bg-surface"
                onMouseDown={() => {
                  onRequestCreate(search.trim());
                  setSearch('');
                  setFocused(false);
                }}
              >
                + Buat bahan baru: "{search.trim()}"
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
