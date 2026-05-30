import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { SettingsPageHeader } from '~/components/settings/primitives';
import { PinEntry } from '~/components/staff/pin-entry';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/_pos/settings/staff')({
  component: StaffSettingsPage,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StaffPermissions = {
  canVoid: boolean;
  canDiscount: boolean;
  canManageShift: boolean;
  canViewReports: boolean;
  canEditMenu: boolean;
};

type StaffRow = {
  _id: Id<'cafeStaff'>;
  _creationTime: number;
  cafeId: Id<'cafes'>;
  name: string;
  pinHash?: string;
  role: 'owner' | 'cashier';
  archived: boolean;
  createdAt: number;
  phone?: string;
  email?: string;
  permissions?: StaffPermissions;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function effectivePermissions(row: StaffRow): StaffPermissions {
  return (
    row.permissions ?? {
      canVoid: false,
      canDiscount: false,
      canManageShift: false,
      canViewReports: false,
      canEditMenu: false,
    }
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function StaffSettingsPage() {
  const { t } = useLingui();
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<Id<'cafeStaff'> | null>(null);
  const [resetting, setResetting] = useState<{ id: Id<'cafeStaff'>; name: string } | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const staff = useQuery(api.staff.list, { includeArchived });
  const create = useMutation(api.staff.create);
  const resetPin = useMutation(api.staff.resetPin);
  const archive = useMutation(api.staff.archive);

  const filtered = staff?.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()),
  );

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

  if (staff === undefined)
    return <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsPageHeader
        title={<Trans>Staf</Trans>}
        description={<Trans>Kelola kasir, kontak, izin akses, dan PIN.</Trans>}
      />

      {/* ── Add-cashier form ─────────────────────────────────────────────── */}
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
            // eslint-disable-next-line lingui/no-unlocalized-strings
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

      {/* ── Controls row ─────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 flex-wrap">
        <Input
          className="flex-1 min-w-48"
          placeholder={t`Cari nama staf…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Switch
            checked={includeArchived}
            onCheckedChange={setIncludeArchived}
            id="toggle-archived"
          />
          <span><Trans>Tampilkan arsip</Trans></span>
        </label>
      </div>

      {/* ── Staff list ────────────────────────────────────────────────────── */}
      <div className="rounded-md border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40 border-b border-border">
              <th className="py-2 px-3"><Trans>Nama</Trans></th>
              <th className="py-2 px-3 w-24"><Trans>Peran</Trans></th>
              <th className="py-2 px-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered && filtered.length === 0 && (
              <tr>
                <td colSpan={3} className="py-6 text-center text-muted-foreground">
                  <Trans>Tidak ada staf yang ditemukan.</Trans>
                </td>
              </tr>
            )}
            {filtered?.map((s) => (
              <StaffRowGroup
                key={s._id}
                row={s}
                expanded={expandedId === s._id}
                onToggleExpand={() =>
                  setExpandedId((prev) => (prev === s._id ? null : s._id))
                }
                onResetPinClick={() => setResetting({ id: s._id, name: s.name })}
                onArchive={() => archive({ id: s._id })}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Reset-PIN dialog ─────────────────────────────────────────────── */}
      <ResetPinDialog
        resetting={resetting}
        resetError={resetError}
        onClose={() => setResetting(null)}
        onSubmit={handleResetPin}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ResetPinDialog — extracted to avoid lingui/no-expression-in-message on
// object property access inside template literals
// ---------------------------------------------------------------------------

function ResetPinDialog({
  resetting,
  resetError,
  onClose,
  onSubmit,
}: {
  resetting: { id: Id<'cafeStaff'>; name: string } | null;
  resetError: string | null;
  onClose: () => void;
  onSubmit: (pin: string) => Promise<void>;
}) {
  const { t } = useLingui();
  const staffName = resetting?.name ?? '';
  return (
    <Dialog open={!!resetting} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{resetting ? t`Ganti PIN untuk ${staffName}` : null}</DialogTitle>
        </DialogHeader>
        <PinEntry
          onComplete={(pin) => {
            void onSubmit(pin);
          }}
          {...(resetError ? { errorMessage: resetError } : {})}
        />
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// StaffRowGroup — summary row + collapsible detail panel
// ---------------------------------------------------------------------------

function StaffRowGroup({
  row,
  expanded,
  onToggleExpand,
  onResetPinClick,
  onArchive,
}: {
  row: StaffRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onResetPinClick: () => void;
  onArchive: () => Promise<unknown>;
}) {
  const { t } = useLingui();
  const isArchived = row.archived;

  return (
    <>
      {/* Summary row */}
      <tr
        className={cn(
          'border-b border-border/50 hover:bg-muted/30 transition-colors',
          isArchived && 'opacity-60',
        )}
      >
        <td className="py-2 px-3">
          <div className="flex items-center gap-2">
            <span className="font-medium">{row.name}</span>
            {isArchived && (
              <Badge variant="secondary"><Trans>Arsip</Trans></Badge>
            )}
          </div>
          {(row.phone || row.email) && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[row.phone, row.email].filter(Boolean).join(' · ')}
            </p>
          )}
        </td>
        <td className="py-2 px-3 text-muted-foreground">
          {row.role === 'owner' ? t`Pemilik` : t`Kasir`}
        </td>
        <td className="py-2 px-3 text-right">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onToggleExpand}
            aria-label={expanded ? t`Tutup detail` : t`Buka detail`}
          >
            {expanded ? (
              <ChevronUp className="size-4" />
            ) : (
              <ChevronDown className="size-4" />
            )}
          </Button>
        </td>
      </tr>

      {/* Expandable detail panel */}
      {expanded && (
        <tr className={cn('border-b border-border/50', isArchived && 'opacity-60')}>
          <td colSpan={3} className="px-0 py-0">
            <StaffDetail
              row={row}
              onResetPinClick={onResetPinClick}
              onArchive={onArchive}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// StaffDetail — the expanded panel (keyed by row._id so state resets)
// ---------------------------------------------------------------------------

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function StaffDetail({
  row,
  onResetPinClick,
  onArchive,
}: {
  row: StaffRow;
  onResetPinClick: () => void;
  onArchive: () => Promise<unknown>;
}) {
  const { t } = useLingui();

  // Contact details form state
  const [name, setName] = useState(row.name);
  const [phone, setPhone] = useState(row.phone ?? '');
  const [email, setEmail] = useState(row.email ?? '');
  const [detailsSaveState, setDetailsSaveState] = useState<SaveState>('idle');
  const [detailsError, setDetailsError] = useState<string | null>(null);

  // Permissions state (optimistic local copy)
  const [perms, setPerms] = useState<StaffPermissions>(() => effectivePermissions(row));

  // Sync local state when row changes from Convex reactivity
  useEffect(() => {
    setName(row.name);
    setPhone(row.phone ?? '');
    setEmail(row.email ?? '');
    setPerms(effectivePermissions(row));
  }, [row]);

  const updateDetails = useMutation(api.staff.updateDetails);
  const setPermissions = useMutation(api.staff.setPermissions);

  async function handleSaveDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setDetailsSaveState('saving');
    setDetailsError(null);
    try {
      await updateDetails({
        id: row._id,
        name: name.trim(),
        phone: phone.trim() || '',
        email: email.trim() || '',
      });
      setDetailsSaveState('saved');
      setTimeout(() => setDetailsSaveState('idle'), 2000);
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : t`Gagal menyimpan.`);
      setDetailsSaveState('error');
    }
  }

  async function handlePermissionToggle(
    key: keyof StaffPermissions,
    value: boolean,
  ) {
    const nextPerms = { ...perms, [key]: value };
    setPerms(nextPerms); // optimistic
    try {
      await setPermissions({ id: row._id, permissions: nextPerms });
    } catch {
      setPerms(perms); // revert on error
    }
  }

  const isOwner = row.role === 'owner';

  return (
    <div className="bg-muted/20 border-t border-border/30 px-4 py-4 space-y-5">
      {/* ── Contact details ─────────────────────────────────────────────── */}
      <form onSubmit={handleSaveDetails} className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
          <Trans>Detail kontak</Trans>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor={`name-${row._id}`}>
              <Trans>Nama</Trans>
            </label>
            <Input
              id={`name-${row._id}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor={`phone-${row._id}`}>
              <Trans>Telepon</Trans>
            </label>
            <Input
              id={`phone-${row._id}`}
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08xx…"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor={`email-${row._id}`}>
              <Trans>Email</Trans>
            </label>
            <Input
              id={`email-${row._id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@contoh.com"
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={detailsSaveState === 'saving'}>
            {detailsSaveState === 'saving' && <Spinner data-icon="inline-start" />}
            <Trans>Simpan</Trans>
          </Button>
          {detailsSaveState === 'saved' && (
            <span className="text-xs text-green-600 dark:text-green-400">
              <Trans>Tersimpan</Trans>
            </span>
          )}
          {detailsSaveState === 'error' && detailsError && (
            <span className="text-xs text-destructive">{detailsError}</span>
          )}
        </div>
      </form>

      {/* ── Permissions ─────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
          <Trans>Izin akses</Trans>
        </p>
        {isOwner ? (
          <p className="text-sm text-muted-foreground">
            <Trans>Pemilik memiliki semua izin.</Trans>
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PermissionRow
              label={t`Void transaksi`}
              checked={perms.canVoid}
              disabled={isOwner}
              onCheckedChange={(v) => {
                // eslint-disable-next-line lingui/no-unlocalized-strings
                void handlePermissionToggle('canVoid', v);
              }}
            />
            <PermissionRow
              label={t`Beri diskon`}
              checked={perms.canDiscount}
              disabled={isOwner}
              onCheckedChange={(v) => {
                // eslint-disable-next-line lingui/no-unlocalized-strings
                void handlePermissionToggle('canDiscount', v);
              }}
            />
            <PermissionRow
              label={t`Buka/tutup shift`}
              checked={perms.canManageShift}
              disabled={isOwner}
              onCheckedChange={(v) => {
                // eslint-disable-next-line lingui/no-unlocalized-strings
                void handlePermissionToggle('canManageShift', v);
              }}
            />
            <PermissionRow
              label={t`Lihat laporan`}
              checked={perms.canViewReports}
              disabled={isOwner}
              onCheckedChange={(v) => {
                // eslint-disable-next-line lingui/no-unlocalized-strings
                void handlePermissionToggle('canViewReports', v);
              }}
            />
            <PermissionRow
              label={t`Edit menu`}
              checked={perms.canEditMenu}
              disabled={isOwner}
              onCheckedChange={(v) => {
                // eslint-disable-next-line lingui/no-unlocalized-strings
                void handlePermissionToggle('canEditMenu', v);
              }}
            />
          </div>
        )}
      </div>

      {/* ── Actions (PIN + Archive) ──────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-1 border-t border-border/30">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onResetPinClick}
        >
          {row.pinHash ? t`Ganti PIN` : t`Set PIN`}
        </Button>
        {!row.archived && (
          <ConfirmArchive
            noun="staf"
            name={row.name}
            onConfirm={onArchive}
            trigger={
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trans>Arsipkan</Trans>
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PermissionRow — a single labeled switch
// ---------------------------------------------------------------------------

function PermissionRow({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-background border border-border/50 cursor-pointer select-none">
      <span className="text-sm">{label}</span>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
      />
    </label>
  );
}
