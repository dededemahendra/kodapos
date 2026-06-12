import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Archive, Check, Grid3x3, Pencil, Plus, X } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type Table = Doc<'tables'>;

export function TableManageDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const tables = useQuery(api.tables.list, open ? {} : 'skip');
  const create = useMutation(api.tables.create);
  const update = useMutation(api.tables.update);
  const archive = useMutation(api.tables.archive);

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<Table['_id'] | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Table | null>(null);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (creating) return;
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await create({ name });
      toast.success(t`Meja disimpan.`);
      setNewName('');
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan meja.`;
      toast.error(message);
    } finally {
      setCreating(false);
    }
  }

  function startEdit(table: Table) {
    setEditingId(table._id);
    setEditName(table.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
  }

  async function saveEdit(table: Table) {
    if (savingEdit) return;
    const name = editName.trim();
    if (!name) return;
    setSavingEdit(true);
    try {
      await update({ id: table._id, name });
      toast.success(t`Meja disimpan.`);
      cancelEdit();
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan meja.`;
      toast.error(message);
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Kelola meja</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Tambah, ubah nama, atau arsipkan meja.</Trans>
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onCreate} className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t`Nama meja`}
            aria-label={t`Nama meja`}
            maxLength={40}
          />
          <Button type="submit" disabled={creating || newName.trim().length === 0}>
            {creating ? <Spinner data-icon="inline-start" /> : <Plus />}
            <Trans>Tambah meja</Trans>
          </Button>
        </form>

        <div className="mt-2 max-h-80 overflow-y-auto">
          {tables === undefined ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : tables.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Grid3x3 />
                </EmptyMedia>
                <EmptyTitle>
                  <Trans>Belum ada meja.</Trans>
                </EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {tables.map((table) => (
                <li key={table._id} className="flex items-center gap-2 py-2">
                  {editingId === table._id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        aria-label={t`Nama meja`}
                        maxLength={40}
                        autoFocus
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t`Simpan`}
                        disabled={savingEdit || editName.trim().length === 0}
                        onClick={() => saveEdit(table)}
                      >
                        {savingEdit ? <Spinner /> : <Check />}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t`Batal`}
                        disabled={savingEdit}
                        onClick={cancelEdit}
                      >
                        <X />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 truncate font-medium">{table.name}</span>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t`Ubah`}
                        onClick={() => startEdit(table)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={t`Arsipkan`}
                        onClick={() => setArchiveTarget(table)}
                      >
                        <Archive />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </DialogContent>

      <ConfirmDialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
        title={<Trans>Hapus meja?</Trans>}
        description={
          archiveTarget ? (
            <Trans>"{archiveTarget.name}" tidak akan muncul di lantai meja.</Trans>
          ) : undefined
        }
        confirmLabel={<Trans>Hapus</Trans>}
        destructive
        onConfirm={async () => {
          if (!archiveTarget) return;
          try {
            await archive({ id: archiveTarget._id });
            toast.success(t`Meja disimpan.`);
          } catch (err) {
            const message = err instanceof Error ? err.message : t`Gagal menyimpan meja.`;
            toast.error(message);
            throw err;
          }
        }}
      />
    </Dialog>
  );
}
