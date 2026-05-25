import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export function CategoryTable() {
  const categories = useQuery(api.menu.categories.list, {});
  const createCategory = useMutation(api.menu.categories.create);
  const updateCategory = useMutation(api.menu.categories.update);
  const reorderCategory = useMutation(api.menu.categories.reorder);
  const archiveCategory = useMutation(api.menu.categories.archive);
  const [editingId, setEditingId] = useState<Id<'categories'> | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createCategory({ name: String(fd.get('name') ?? '') });
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat kategori.');
    } finally {
      setCreating(false);
    }
  }

  if (categories === undefined) return <p className="text-muted-foreground">Memuat…</p>;

  return (
    <div className="space-y-4">
      <form onSubmit={handleCreate} className="flex gap-2 items-end max-w-md">
        <div className="flex-1">
          <label htmlFor="newName" className="text-xs text-muted-foreground">
            Nama kategori baru
          </label>
          <Input id="newName" name="name" placeholder="mis. Kopi" required maxLength={60} />
        </div>
        <Button type="submit" disabled={creating}>
          {creating && <Spinner data-icon="inline-start" />}
          {creating ? '…' : '+ Tambah'}
        </Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
            <th className="py-2 px-2 w-12">#</th>
            <th className="py-2 px-2">Nama</th>
            <th className="py-2 px-2 w-32 text-right">Urutan</th>
            <th className="py-2 px-2 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {categories.length === 0 && (
            <tr>
              <td colSpan={4} className="py-6 text-center text-muted-foreground">
                Belum ada kategori.
              </td>
            </tr>
          )}
          {categories.map((c, i) => (
            <tr key={c._id} className="border-b border-border/50">
              <td className="py-2 px-2 text-muted-foreground">{i + 1}</td>
              <td className="py-2 px-2">
                {editingId === c._id ? (
                  <InlineEdit
                    initial={c.name}
                    onSave={async (name) => {
                      await updateCategory({ id: c._id, name });
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <button
                    type="button"
                    className="text-left hover:underline"
                    onClick={() => setEditingId(c._id)}
                  >
                    {c.name}
                  </button>
                )}
              </td>
              <td className="py-2 px-2 text-right">
                <button
                  type="button"
                  className="px-1 disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => reorderCategory({ id: c._id, direction: 'up' })}
                  aria-label="Naikkan urutan"
                >
                  ▲
                </button>
                <button
                  type="button"
                  className="px-1 disabled:opacity-30"
                  disabled={i === categories.length - 1}
                  onClick={() => reorderCategory({ id: c._id, direction: 'down' })}
                  aria-label="Turunkan urutan"
                >
                  ▼
                </button>
              </td>
              <td className="py-2 px-2 text-right">
                <ConfirmArchive
                  noun="kategori"
                  name={c.name}
                  onConfirm={() => archiveCategory({ id: c._id })}
                  trigger={
                    <button type="button" className="text-xs text-danger hover:underline">
                      Arsipkan
                    </button>
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InlineEdit({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setSaving(true);
        await onSave(name);
        setSaving(false);
      }}
      className="flex gap-2 items-center"
    >
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
        maxLength={60}
      />
      <Button type="submit" size="sm" disabled={saving}>
        Simpan
      </Button>
    </form>
  );
}
