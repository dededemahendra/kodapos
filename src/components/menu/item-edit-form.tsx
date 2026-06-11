import { api } from 'convex/_generated/api';
import type { Doc, Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useRef, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { uploadToStorage } from '~/lib/upload';
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
    imageStorageId?: Id<'_storage'>;
    imageUrl?: string | null;
  };
  attached: AttachedGroupRow[];
  onSaved: (id: Id<'menuItems'>) => void;
}

export function ItemEditForm(props: ItemEditFormProps) {
  const { t } = useLingui();
  const categories = useQuery(api.menu.categories.list, {});
  const allGroups = useQuery(api.menu.modifierGroups.list, {});
  const generateUploadUrl = useMutation(api.cafes.generateUploadUrl);
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
  const [imageStorageId, setImageStorageId] = useState<Id<'_storage'> | undefined>(props.initial.imageStorageId);
  const [imageUrl, setImageUrl] = useState<string | null>(props.initial.imageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const imgRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const storageId = await uploadToStorage(generateUploadUrl, file);
      setImageStorageId(storageId);
      setImageUrl(URL.createObjectURL(file));
    } catch {
      setError(t`Gagal mengunggah gambar.`);
    } finally {
      setUploading(false);
      if (imgRef.current) imgRef.current.value = '';
    }
  }

  function removeImage() {
    setImageStorageId(undefined);
    setImageUrl(null);
  }

  const attachedIds = new Set(props.attached.map((a) => a.group._id));
  const availableGroups = (allGroups ?? []).filter((g) => !attachedIds.has(g._id));

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!categoryId) {
      setError(t`Pilih kategori terlebih dahulu.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      let id: Id<'menuItems'>;
      if (props.itemId === 'new') {
        id = await createItem({ categoryId, name, priceIDR, ...(imageStorageId ? { imageStorageId } : {}) });
      } else {
        await updateItem({ id: props.itemId, categoryId, name, priceIDR, ...(imageStorageId ? { imageStorageId } : {}) });
        id = props.itemId;
      }
      if (props.itemId !== 'new' && isActive !== props.initial.isActive) {
        await setActive({ id, isActive });
      }
      props.onSaved(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t`Gagal menyimpan item.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-8 max-w-4xl">
      <div>
        <h2 className="text-xs uppercase tracking-wide text-muted-foreground mb-2"><Trans>Dasar</Trans></h2>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="name"><Trans>Nama</Trans></FieldLabel>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={80}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="categoryId"><Trans>Kategori</Trans></FieldLabel>
            <select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value as Id<'categories'>)}
              required
              className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              <option value="">{t`Pilih kategori`}</option>
              {(categories ?? []).map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="priceIDR"><Trans>Harga (Rp)</Trans></FieldLabel>
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
          <Field>
            <FieldLabel><Trans>Gambar item</Trans></FieldLabel>
            <div className="flex items-center gap-3">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="size-16 rounded object-cover border border-border" />
              ) : (
                <div className="size-16 rounded bg-muted grid place-items-center text-muted-foreground text-xs">—</div>
              )}
              <input ref={imgRef} type="file" accept="image/*" onChange={onImageChange} className="hidden" />
              <div className="flex flex-col gap-1">
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => imgRef.current?.click()}>
                  {uploading ? <Spinner data-icon="inline-start" /> : null}
                  {imageStorageId ? <Trans>Ganti gambar</Trans> : <Trans>Unggah gambar</Trans>}
                </Button>
                {imageStorageId ? (
                  <Button type="button" variant="ghost" size="sm" onClick={removeImage}><Trans>Hapus gambar</Trans></Button>
                ) : null}
              </div>
            </div>
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
                <Trans>Aktif (tampil ke kasir)</Trans>
              </label>
            </Field>
          )}
        </FieldGroup>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
            <Trans>Grup modifier ({props.attached.length})</Trans>
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
              <option value="">{t`+ Pasang grup…`}</option>
              {availableGroups.map((g) => (
                <option key={g._id} value={g._id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
        </div>
        {props.itemId === 'new' ? (
          <p className="text-sm text-muted-foreground"><Trans>Simpan item dulu untuk memasang grup modifier.</Trans></p>
        ) : props.attached.length === 0 ? (
          <p className="text-sm text-muted-foreground"><Trans>Belum ada grup terpasang.</Trans></p>
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
                    {a.group.required ? t`wajib` : t`opsional`} · {a.group.minSelect}/
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
                  aria-label={t`Naikkan urutan`}
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
                  aria-label={t`Turunkan urutan`}
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
                  className="text-xs text-destructive hover:underline"
                >
                  <Trans>Lepas</Trans>
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
                <button type="button" className="text-sm text-destructive hover:underline">
                  <Trans>Arsipkan item</Trans>
                </button>
              }
            />
          )}
        </div>
        <div className="flex gap-2">
          {error && <FieldError>{error}</FieldError>}
          <Button type="submit" disabled={submitting}>
            {submitting && <Spinner data-icon="inline-start" />}
            {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
          </Button>
        </div>
      </div>
    </form>
  );
}
