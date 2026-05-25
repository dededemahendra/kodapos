import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { Button } from '~/components/ui/button';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export interface AttachedGroupRow {
  group: Doc<'modifierGroups'>;
  position: number;
}

export interface ItemEditFormProps {
  itemId: Id<'menuItems'> | 'new';
  initial: {
    name: string;
    categoryId: Id<'categories'> | '';
    priceIDR: number;
    isActive: boolean;
  };
  attached: AttachedGroupRow[];
  onSaved: (id: Id<'menuItems'>) => void;
}

export function ItemEditForm(props: ItemEditFormProps) {
  const categories = useQuery(api.menu.categories.list, {});
  const allGroups = useQuery(api.menu.modifierGroups.list, {});
  const createItem = useMutation(api.menu.items.create);
  const updateItem = useMutation(api.menu.items.update);
  const setActive = useMutation(api.menu.items.setActive);
  const archive = useMutation(api.menu.items.archive);
  const attachGroup = useMutation(api.menu.itemGroups.attach);
  const detachGroup = useMutation(api.menu.itemGroups.detach);
  const reorderGroup = useMutation(api.menu.itemGroups.reorder);

  const [name, setName] = useState(props.initial.name);
  const [categoryId, setCategoryId] = useState<Id<'categories'> | ''>(props.initial.categoryId);
  const [priceIDR, setPriceIDR] = useState<number>(props.initial.priceIDR);
  const [isActive, setIsActive] = useState(props.initial.isActive);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const attachedIds = new Set(props.attached.map((a) => a.group._id));
  const availableGroups = (allGroups ?? []).filter((g) => !attachedIds.has(g._id));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!categoryId) {
      setError('Pilih kategori terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let id: Id<'menuItems'>;
      if (props.itemId === 'new') {
        id = await createItem({ categoryId, name, priceIDR });
      } else {
        await updateItem({ id: props.itemId, categoryId, name, priceIDR });
        id = props.itemId;
      }
      if (props.itemId !== 'new' && isActive !== props.initial.isActive) {
        await setActive({ id, isActive });
      }
      props.onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal menyimpan item.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-8 max-w-4xl">
      <div>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Dasar</h2>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name">Nama</FieldLabel>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="categoryId">Kategori</FieldLabel>
            <select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value as Id<'categories'>)}
              required
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">— Pilih kategori —</option>
              {(categories ?? []).map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="priceIDR">Harga (Rp)</FieldLabel>
            <Input
              id="priceIDR"
              type="number"
              min="0"
              step="500"
              value={priceIDR}
              onChange={(e) => setPriceIDR(Number(e.target.value))}
              required
            />
          </Field>
          {props.itemId !== 'new' && (
            <Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="h-4 w-4"
                />
                Aktif (tampil ke kasir)
              </label>
            </Field>
          )}
        </FieldGroup>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
            Grup modifier ({props.attached.length})
          </h2>
          {props.itemId !== 'new' && availableGroups.length > 0 && (
            <select
              defaultValue=""
              onChange={async (e) => {
                if (e.target.value && props.itemId !== 'new') {
                  await attachGroup({
                    menuItemId: props.itemId,
                    modifierGroupId: e.target.value as Id<'modifierGroups'>,
                  });
                  e.target.value = '';
                }
              }}
              className="text-xs px-2 py-1 border border-border rounded-md bg-background"
            >
              <option value="">+ Pasang grup…</option>
              {availableGroups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {props.itemId === 'new' ? (
          <p className="text-sm text-muted-foreground">Simpan item dulu untuk memasang grup modifier.</p>
        ) : props.attached.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada grup terpasang.</p>
        ) : (
          <ul className="space-y-2">
            {props.attached.map((a, i) => (
              <li
                key={a.group._id}
                className="border border-border rounded-md p-2 flex items-center gap-2"
              >
                <span className="flex-1">
                  <strong>{a.group.name}</strong>
                  <span className="text-xs text-muted-foreground ml-2">
                    {a.group.required ? 'wajib' : 'opsional'} · {a.group.minSelect}/
                    {a.group.maxSelect}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() =>
                    props.itemId !== 'new' &&
                    reorderGroup({
                      menuItemId: props.itemId,
                      modifierGroupId: a.group._id,
                      direction: 'up',
                    })
                  }
                  aria-label="Naikkan urutan"
                  className="px-1 disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  type="button"
                  disabled={i === props.attached.length - 1}
                  onClick={() =>
                    props.itemId !== 'new' &&
                    reorderGroup({
                      menuItemId: props.itemId,
                      modifierGroupId: a.group._id,
                      direction: 'down',
                    })
                  }
                  aria-label="Turunkan urutan"
                  className="px-1 disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  type="button"
                  onClick={() =>
                    props.itemId !== 'new' &&
                    detachGroup({
                      menuItemId: props.itemId,
                      modifierGroupId: a.group._id,
                    })
                  }
                  className="text-xs text-danger hover:underline"
                >
                  Lepas
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="col-span-2 flex justify-between items-center mt-4 pt-4 border-t border-border">
        <div>
          {props.itemId !== 'new' && (
            <ConfirmArchive
              noun="item"
              name={name}
              onConfirm={async () => {
                if (props.itemId === 'new') return;
                await archive({ id: props.itemId });
                props.onSaved(props.itemId);
              }}
              trigger={
                <button type="button" className="text-sm text-danger hover:underline">
                  Arsipkan item
                </button>
              }
            />
          )}
        </div>
        <div className="flex gap-2">
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </div>
      </div>
    </form>
  );
}
