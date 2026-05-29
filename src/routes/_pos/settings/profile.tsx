import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { useRef, useState, useMemo } from 'react';
import { SaveBar } from '~/components/settings/save-bar';
import {
  RowSep,
  SettingRow,
  SettingsPageHeader,
  SettingsSection,
} from '~/components/settings/primitives';
import { useEditableState } from '~/components/settings/use-editable-state';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { Switch } from '~/components/ui/switch';
import { FieldGroup } from '~/components/ui/field';

export const Route = createFileRoute('/_pos/settings/profile')({
  component: SettingsProfile,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OperatingHoursDraft {
  day: number;
  open: boolean;
  openTime: string;
  closeTime: string;
}

interface ProfileDraft {
  name: string;
  businessType: string;
  phone: string;
  whatsapp: string;
  email: string;
  instagram: string;
  addressLine: string;
  city: string;
  postalCode: string;
  timezone: string;
  operatingHours: OperatingHoursDraft[];
}

const DAY_LABELS = [
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
  'Minggu',
] as const;

function defaultHours(): OperatingHoursDraft[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day: i,
    open: true,
    openTime: '08:00',
    closeTime: '22:00',
  }));
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function SettingsProfile() {
  const { t } = useLingui();
  const cafe = useQuery(api.cafes.myCafe);

  const updateProfileDetails = useMutation(api.cafes.updateProfileDetails);
  const generateUploadUrl = useMutation(api.cafes.generateUploadUrl);
  const setLogo = useMutation(api.cafes.setLogo);
  const removeLogo = useMutation(api.cafes.removeLogo);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Build a stable draft from the cafe object
  const initialDraft = useMemo<ProfileDraft | undefined>(() => {
    if (!cafe) return undefined;
    const hours = defaultHours();
    if (cafe.operatingHours) {
      for (const h of cafe.operatingHours) {
        if (h.day >= 0 && h.day < 7) {
          hours[h.day] = { ...h };
        }
      }
    }
    return {
      name: cafe.name ?? '',
      businessType: cafe.businessType ?? '',
      phone: cafe.phone ?? '',
      whatsapp: cafe.whatsapp ?? '',
      email: cafe.email ?? '',
      instagram: cafe.instagram ?? '',
      addressLine: cafe.addressLine ?? '',
      city: cafe.city ?? '',
      postalCode: cafe.postalCode ?? '',
      timezone: cafe.timezone ?? 'Asia/Jakarta',
      operatingHours: hours,
    };
  }, [cafe]);

  const { draft, setDraft, dirty, reset } = useEditableState<ProfileDraft>(initialDraft);

  if (cafe === undefined) {
    return (
      <p className="text-muted-foreground">
        <Trans>Memuat…</Trans>
      </p>
    );
  }
  if (cafe === null) {
    return (
      <p className="text-muted-foreground">
        <Trans>Kafe tidak ditemukan.</Trans>
      </p>
    );
  }
  if (!draft) return null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function updateField(field: keyof Omit<ProfileDraft, 'operatingHours'>, value: string) {
    setDraft({ ...draft!, [field]: value });
  }

  function updateHour(dayIndex: number, patch: Partial<OperatingHoursDraft>) {
    const hours = draft!.operatingHours.map((h, i) =>
      i === dayIndex ? { ...h, ...patch } : h
    );
    setDraft({ ...draft!, operatingHours: hours });
  }

  async function handleSave() {
    // Capture draft synchronously before any await so TypeScript can narrow it.
    const d = draft;
    if (!d) return;
    setError(null);
    try {
      const optional = (v: string) => (v.trim() ? v : undefined);
      await updateProfileDetails({
        name: d.name,
        ...(optional(d.businessType) ? { businessType: d.businessType } : {}),
        ...(optional(d.phone) ? { phone: d.phone } : {}),
        ...(optional(d.whatsapp) ? { whatsapp: d.whatsapp } : {}),
        ...(optional(d.email) ? { email: d.email } : {}),
        ...(optional(d.instagram) ? { instagram: d.instagram } : {}),
        ...(optional(d.addressLine) ? { addressLine: d.addressLine } : {}),
        ...(optional(d.city) ? { city: d.city } : {}),
        ...(optional(d.postalCode) ? { postalCode: d.postalCode } : {}),
        timezone: d.timezone,
        operatingHours: d.operatingHours,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal menyimpan.`);
      throw e;
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const url = await generateUploadUrl();
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      const json = (await res.json()) as { storageId: Id<'_storage'> };
      await setLogo({ storageId: json.storageId });
    } catch {
      setError(t`Gagal mengunggah logo.`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    setError(null);
    try {
      await removeLogo();
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal menghapus logo.`);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsPageHeader
        title={<Trans>Profil kafe</Trans>}
        description={<Trans>Kelola identitas, kontak, dan jam operasional kafe Anda.</Trans>}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 1. Identitas                                                         */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Identitas</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Nama kafe</Trans>}
            control={
              <Input
                value={draft.name}
                onChange={(e) => updateField('name', e.target.value)}
                required
                maxLength={80}
                className="w-64"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Jenis usaha</Trans>}
            control={
              <Select
                value={draft.businessType || '_none'}
                onValueChange={(v) => updateField('businessType', v === '_none' ? '' : v)}
              >
                <SelectTrigger className="w-44">
                  <SelectValue placeholder={t`Pilih jenis usaha`} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">
                    <Trans>— Pilih —</Trans>
                  </SelectItem>
                  <SelectItem value="cafe">
                    <Trans>Kafe</Trans>
                  </SelectItem>
                  <SelectItem value="restoran">
                    <Trans>Restoran</Trans>
                  </SelectItem>
                  <SelectItem value="coffee_shop">
                    <Trans>Kedai kopi</Trans>
                  </SelectItem>
                  <SelectItem value="bakery">
                    <Trans>Bakery</Trans>
                  </SelectItem>
                  <SelectItem value="bar">
                    <Trans>Bar</Trans>
                  </SelectItem>
                  <SelectItem value="other">
                    <Trans>Lainnya</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Logo</Trans>}
            description={<Trans>Tampil di struk dan halaman kafe.</Trans>}
            control={
              <div className="flex items-center gap-3">
                {cafe.logoUrl && (
                  <img
                    src={cafe.logoUrl}
                    alt={t`Logo kafe`}
                    className="h-16 w-16 rounded-md object-cover border border-border"
                  />
                )}
                <div className="flex flex-col gap-1.5">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading && <Spinner data-icon="inline-start" />}
                    <Trans>Unggah logo</Trans>
                  </Button>
                  {cafe.logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={uploading}
                      onClick={handleRemoveLogo}
                    >
                      <Trans>Hapus</Trans>
                    </Button>
                  )}
                </div>
              </div>
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Kontak                                                            */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Kontak</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Nomor HP</Trans>}
            control={
              <Input
                type="tel"
                value={draft.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-48"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>WhatsApp</Trans>}
            control={
              <Input
                type="tel"
                value={draft.whatsapp}
                onChange={(e) => updateField('whatsapp', e.target.value)}
                className="w-48"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Email</Trans>}
            control={
              <Input
                type="email"
                value={draft.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-64"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Instagram</Trans>}
            control={
              <Input
                value={draft.instagram}
                onChange={(e) => updateField('instagram', e.target.value)}
                placeholder={t`@namakafe`}
                className="w-48"
              />
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Alamat                                                            */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Alamat</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Alamat</Trans>}
            control={
              <Input
                value={draft.addressLine}
                onChange={(e) => updateField('addressLine', e.target.value)}
                className="w-64"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Kota</Trans>}
            control={
              <Input
                value={draft.city}
                onChange={(e) => updateField('city', e.target.value)}
                className="w-48"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Kode pos</Trans>}
            control={
              <Input
                value={draft.postalCode}
                onChange={(e) => updateField('postalCode', e.target.value)}
                inputMode="numeric"
                className="w-32"
              />
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Wilayah                                                           */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Wilayah</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Zona waktu</Trans>}
            control={
              <Select value={draft.timezone} onValueChange={(v) => updateField('timezone', v)}>
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Jakarta">
                    <Trans>WIB (Jakarta)</Trans>
                  </SelectItem>
                  <SelectItem value="Asia/Makassar">
                    <Trans>WITA (Makassar)</Trans>
                  </SelectItem>
                  <SelectItem value="Asia/Jayapura">
                    <Trans>WIT (Jayapura)</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Jam operasional                                                   */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Jam operasional</Trans>}>
        <FieldGroup>
          {draft.operatingHours.map((h, i) => (
            <div key={h.day}>
              {i > 0 && <RowSep />}
              <SettingRow
                label={DAY_LABELS[i]}
                control={
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={h.open}
                      onCheckedChange={(checked) => updateHour(i, { open: checked })}
                      aria-label={DAY_LABELS[i]}
                    />
                    <Input
                      type="time"
                      value={h.openTime}
                      onChange={(e) => updateHour(i, { openTime: e.target.value })}
                      disabled={!h.open}
                      className="w-28"
                    />
                    <span className="text-muted-foreground text-sm">–</span>
                    <Input
                      type="time"
                      value={h.closeTime}
                      onChange={(e) => updateHour(i, { closeTime: e.target.value })}
                      disabled={!h.open}
                      className="w-28"
                    />
                  </div>
                }
              />
            </div>
          ))}
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* Error + SaveBar                                                       */}
      {/* ------------------------------------------------------------------ */}
      {error && <p className="text-sm text-destructive">{error}</p>}

      <SaveBar dirty={dirty} onReset={reset} onSave={handleSave} />
    </div>
  );
}
