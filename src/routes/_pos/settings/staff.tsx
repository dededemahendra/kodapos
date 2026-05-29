import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { PinEntry } from '~/components/staff/pin-entry';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_pos/settings/staff')({
  component: StaffSettingsPage,
});

function StaffSettingsPage() {
  const { t } = useLingui();
  const staff = useQuery(api.staff.list, {});
  const create = useMutation(api.staff.create);
  const updateName = useMutation(api.staff.updateName);
  const resetPin = useMutation(api.staff.resetPin);
  const archive = useMutation(api.staff.archive);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [resetting, setResetting] = useState<{ id: Id<'cafeStaff'>; name: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await create({
        name: String(fd.get('name') ?? ''),
        pin: String(fd.get('pin') ?? ''),
      });
      form.reset();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : t`Gagal menambah staf.`);
    } finally {
      setCreating(false);
    }
  }

  async function handleResetPin(pin: string): Promise<void> {
    if (!resetting) return;
    setResetError(null);
    try {
      await resetPin({ id: resetting.id, pin });
      setResetting(null);
    } catch (err) {
      setResetError(err instanceof Error ? err.message : t`Gagal mengganti PIN.`);
    }
  }

  if (staff === undefined) return <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold mb-1"><Trans>Staff</Trans></h1>
        <p className="text-muted-foreground text-sm"><Trans>Tambah kasir, ganti PIN, atau arsipkan staf.</Trans></p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-2 items-end">
        <div className="flex-1">
          <label htmlFor="newName" className="text-xs text-muted-foreground">
            <Trans>Nama kasir baru</Trans>
          </label>
          <Input id="newName" name="name" placeholder={t`mis. Andi`} required maxLength={60} />
        </div>
        <div>
          <label htmlFor="newPin" className="text-xs text-muted-foreground">
            <Trans>PIN 4 digit</Trans>
          </label>
          <Input
            id="newPin"
            name="pin"
            type="text"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
          />
        </div>
        <Button type="submit" disabled={creating}>
          {creating && <Spinner data-icon="inline-start" />}
          {creating ? t`…` : t`+ Tambah`}
        </Button>
      </form>
      {createError && <p className="text-sm text-destructive">{createError}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-muted-foreground border-b border-border">
            <th className="py-2 px-2"><Trans>Nama</Trans></th>
            <th className="py-2 px-2 w-24"><Trans>Peran</Trans></th>
            <th className="py-2 px-2 w-32"><Trans>PIN</Trans></th>
            <th className="py-2 px-2 w-44 text-right" />
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => (
            <StaffRow
              key={s._id}
              row={s}
              onRename={(name) => updateName({ id: s._id, name })}
              onArchive={() => archive({ id: s._id })}
              onResetPinClick={() => setResetting({ id: s._id, name: s.name })}
            />
          ))}
        </tbody>
      </table>

      <Dialog open={!!resetting} onOpenChange={(o) => !o && setResetting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{resetting ? t`Ganti PIN untuk ${resetting.name}` : null}</DialogTitle>
          </DialogHeader>
          <PinEntry
            onComplete={(pin) => {
              void handleResetPin(pin);
            }}
            {...(resetError ? { errorMessage: resetError } : {})}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StaffRow({
  row,
  onRename,
  onArchive,
  onResetPinClick,
}: {
  row: { _id: Id<'cafeStaff'>; name: string; role: 'owner' | 'cashier'; pinHash?: string };
  onRename: (name: string) => Promise<unknown>;
  onArchive: () => Promise<unknown>;
  onResetPinClick: () => void;
}) {
  const { t } = useLingui();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [saving, setSaving] = useState(false);
  return (
    <tr className="border-b border-border/50">
      <td className="py-2 px-2">
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              await onRename(name);
              setSaving(false);
              setEditing(false);
            }}
            className="flex gap-2"
          >
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              autoFocus
            />
            <Button type="submit" size="sm" disabled={saving}>
              <Trans>Simpan</Trans>
            </Button>
          </form>
        ) : (
          <button
            type="button"
            className="text-left hover:underline"
            onClick={() => setEditing(true)}
          >
            {row.name}
          </button>
        )}
      </td>
      <td className="py-2 px-2 text-muted-foreground">{row.role === 'owner' ? t`Pemilik` : t`Kasir`}</td>
      <td className="py-2 px-2">
        <button
          type="button"
          className="text-xs text-primary hover:underline"
          onClick={onResetPinClick}
        >
          {row.pinHash ? t`Ganti PIN` : t`Set PIN`}
        </button>
      </td>
      <td className="py-2 px-2 text-right">
        <ConfirmArchive
          noun="staf"
          name={row.name}
          onConfirm={onArchive}
          trigger={
            <button type="button" className="text-xs text-destructive hover:underline">
              <Trans>Arsipkan</Trans>
            </button>
          }
        />
      </td>
    </tr>
  );
}
