import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { useLocale } from '~/components/locale-provider';
import { SaveBar } from '~/components/settings/save-bar';
import { useEditableState } from '~/components/settings/use-editable-state';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldTitle } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Separator } from '~/components/ui/separator';
import { Switch } from '~/components/ui/switch';
import { type Locale, LOCALES } from '~/lib/locale';
import {
  applyDensity,
  applyTheme,
  getDensity,
  getTheme,
  storeDensity,
  storeTheme,
  type Density,
  type Theme,
  useBoolPreference,
  usePreference,
} from '~/lib/preferences';
import { SettingsPageHeader } from '~/components/settings/primitives';

export const Route = createFileRoute('/_pos/settings/general')({
  component: GeneralSettings,
});

// ---------------------------------------------------------------------------
// Section IDs
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A horizontal Field row: label+description on the left, control on the right. */
function SettingRow({
  label,
  description,
  control,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
}) {
  return (
    <Field orientation="horizontal" className="items-start gap-4">
      <div className="flex-1 min-w-0">
        <FieldTitle>{label}</FieldTitle>
        {description && <FieldDescription className="mt-0.5">{description}</FieldDescription>}
      </div>
      <div className="shrink-0">{control}</div>
    </Field>
  );
}

/** Thin separator between rows inside a CardContent. */
function RowSep() {
  return <Separator className="my-1" />;
}

// ---------------------------------------------------------------------------
// Section content components
// ---------------------------------------------------------------------------

function RegionSection({
  locale,
  setLocale,
  timezone,
  setTimezone,
  dateFormat,
  setDateFormat,
  timeFormat,
  setTimeFormat,
}: {
  locale: string;
  setLocale: (v: Locale) => void;
  timezone: string;
  setTimezone: (v: string) => void;
  dateFormat: string;
  setDateFormat: (v: string) => void;
  timeFormat: string;
  setTimeFormat: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Bahasa &amp; Wilayah</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Bahasa</Trans>}
            description={<Trans>Bahasa tampilan aplikasi.</Trans>}
            control={
              <Select value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Zona Waktu</Trans>}
            description={<Trans>Zona waktu untuk jam dan laporan.</Trans>}
            control={
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger className="w-44">
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

          <RowSep />

          <SettingRow
            label={<Trans>Format Tanggal</Trans>}
            description={<Trans>Cara tanggal ditampilkan di struk dan laporan.</Trans>}
            control={
              <Select value={dateFormat} onValueChange={setDateFormat}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dmy-short">13 Mei 2026</SelectItem>
                  <SelectItem value="dmy-numeric">13/05/2026</SelectItem>
                  <SelectItem value="iso">2026-05-13</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Format Waktu</Trans>}
            description={<Trans>Format jam 24-jam atau 12-jam (AM/PM).</Trans>}
            control={
              <Select value={timeFormat} onValueChange={setTimeFormat}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24">
                    <Trans>24 jam</Trans>
                  </SelectItem>
                  <SelectItem value="12">
                    <Trans>12 jam (AM/PM)</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Mata Uang</Trans>}
            description={<Trans>Semua transaksi dalam Rupiah.</Trans>}
            control={
              <span className="text-sm font-mono text-muted-foreground">Rupiah (Rp)</span>
            }
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function AppearanceSection({
  density,
  handleDensity,
  theme,
  handleTheme,
}: {
  density: Density;
  handleDensity: (v: string) => void;
  theme: Theme;
  handleTheme: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Tampilan</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Kepadatan tampilan</Trans>}
            description={<Trans>Atur kerapatan elemen antarmuka.</Trans>}
            control={
              <Select value={density} onValueChange={handleDensity}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="compact">
                    <Trans>Ringkas</Trans>
                  </SelectItem>
                  <SelectItem value="comfortable">
                    <Trans>Nyaman</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Tema</Trans>}
            description={<Trans>Pilih tema terang, gelap, atau ikuti sistem.</Trans>}
            control={
              <Select value={theme} onValueChange={handleTheme}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">
                    <Trans>Sistem</Trans>
                  </SelectItem>
                  <SelectItem value="light">
                    <Trans>Terang</Trans>
                  </SelectItem>
                  <SelectItem value="dark">
                    <Trans>Gelap</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function OrdersSection({
  t,
  confirmClearCart,
  setConfirmClearCart,
  orderPrefix,
  setOrderPrefix,
}: {
  t: (s: TemplateStringsArray, ...args: unknown[]) => string;
  confirmClearCart: boolean;
  setConfirmClearCart: (v: boolean) => void;
  orderPrefix: string;
  setOrderPrefix: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Pesanan</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Konfirmasi sebelum kosongkan keranjang</Trans>}
            description={<Trans>Tampilkan dialog konfirmasi sebelum keranjang dikosongkan.</Trans>}
            control={
              <Switch
                checked={confirmClearCart}
                onCheckedChange={setConfirmClearCart}
                aria-label={t`Konfirmasi sebelum kosongkan keranjang`}
              />
            }
          />

          <RowSep />

          <Field orientation="vertical">
            <FieldTitle>
              <Trans>Awalan nomor pesanan</Trans>
            </FieldTitle>
            <FieldDescription>
              <Trans>Prefiks yang ditambahkan di depan nomor pesanan.</Trans>
            </FieldDescription>
            <Input
              value={orderPrefix}
              onChange={(e) => setOrderPrefix(e.target.value)}
              placeholder={t`mis. INV-`}
              className="mt-1.5 max-w-xs"
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function NotificationsSection({
  t,
  lowStockAlerts,
  setLowStockAlerts,
  saleSound,
  setSaleSound,
}: {
  t: (s: TemplateStringsArray, ...args: unknown[]) => string;
  lowStockAlerts: boolean;
  setLowStockAlerts: (v: boolean) => void;
  saleSound: boolean;
  setSaleSound: (v: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Notifikasi</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Peringatan stok rendah</Trans>}
            description={<Trans>Tampilkan peringatan saat stok bahan mendekati ambang batas.</Trans>}
            control={
              <Switch
                checked={lowStockAlerts}
                onCheckedChange={setLowStockAlerts}
                aria-label={t`Peringatan stok rendah`}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Suara saat transaksi berhasil</Trans>}
            description={<Trans>Putar suara konfirmasi setelah pembayaran selesai.</Trans>}
            control={
              <Switch
                checked={saleSound}
                onCheckedChange={setSaleSound}
                aria-label={t`Suara saat transaksi berhasil`}
              />
            }
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function SecuritySection({
  t,
  pinForVoid,
  setPinForVoid,
  autoLock,
  setAutoLock,
}: {
  t: (s: TemplateStringsArray, ...args: unknown[]) => string;
  pinForVoid: boolean;
  setPinForVoid: (v: boolean) => void;
  autoLock: string;
  setAutoLock: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Keamanan</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Wajib PIN untuk void/refund</Trans>}
            description={<Trans>Kasir harus memasukkan PIN pemilik untuk membatalkan transaksi.</Trans>}
            control={
              <Switch
                checked={pinForVoid}
                onCheckedChange={setPinForVoid}
                aria-label={t`Wajib PIN untuk void/refund`}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Kunci otomatis saat tidak aktif</Trans>}
            description={<Trans>Kembali ke layar PIN setelah periode tidak aktif.</Trans>}
            control={
              <Select value={autoLock} onValueChange={setAutoLock}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="off">
                    <Trans>Mati</Trans>
                  </SelectItem>
                  <SelectItem value="5">
                    <Trans>5 menit</Trans>
                  </SelectItem>
                  <SelectItem value="15">
                    <Trans>15 menit</Trans>
                  </SelectItem>
                  <SelectItem value="30">
                    <Trans>30 menit</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Ringkasan email — persists to Convex via settings.updateNotifications
// ---------------------------------------------------------------------------

interface NotificationsDraft {
  emailSummaryOnClose: boolean;
  summaryEmail: string;
  emailLowStockDaily: boolean;
}

function EmailSummarySection() {
  const { t } = useLingui();
  const s = useQuery(api.settings.get);
  const updateNotifications = useMutation(api.settings.updateNotifications);
  const [error, setError] = useState<string | null>(null);

  const initialDraft = useMemo<NotificationsDraft | undefined>(() => {
    if (!s) return undefined;
    const n = s.notifications ?? { emailSummaryOnClose: false };
    return {
      emailSummaryOnClose: n.emailSummaryOnClose,
      summaryEmail: ('summaryEmail' in n ? n.summaryEmail : undefined) ?? '',
      emailLowStockDaily:
        ('emailLowStockDaily' in n ? n.emailLowStockDaily : undefined) ?? false,
    };
  }, [s]);

  const { draft, setDraft, dirty, reset } = useEditableState<NotificationsDraft>(initialDraft);

  if (s === undefined) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Ringkasan email</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <Trans>Memuat…</Trans>
          </p>
        </CardContent>
      </Card>
    );
  }
  if (!draft) return null;

  async function handleSave() {
    const d = draft;
    if (!d) return;
    setError(null);
    try {
      const summaryEmail = d.summaryEmail.trim() || undefined;
      await updateNotifications({
        notifications: {
          emailSummaryOnClose: d.emailSummaryOnClose,
          ...(summaryEmail !== undefined ? { summaryEmail } : {}),
          emailLowStockDaily: d.emailLowStockDaily,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal menyimpan.`);
      throw e;
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Ringkasan email</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Kirim ringkasan saat tutup shift</Trans>}
            description={
              <Trans>Kirim rekap penjualan dan kas ke email saat shift ditutup.</Trans>
            }
            control={
              <Switch
                checked={draft.emailSummaryOnClose}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, emailSummaryOnClose: checked })
                }
                aria-label={t`Kirim ringkasan saat tutup shift`}
              />
            }
          />

          <RowSep />

          <Field orientation="vertical">
            <FieldTitle>
              <Trans>Email penerima ringkasan</Trans>
            </FieldTitle>
            <Input
              type="email"
              value={draft.summaryEmail}
              onChange={(e) => setDraft({ ...draft, summaryEmail: e.target.value })}
              placeholder="email@contoh.com"
              className="mt-1.5 max-w-xs"
            />
          </Field>

          <RowSep />

          <SettingRow
            label={<Trans>Email peringatan stok menipis harian</Trans>}
            description={<Trans>Memakai email penerima yang sama.</Trans>}
            control={
              <Switch
                checked={draft.emailLowStockDaily}
                onCheckedChange={(checked) =>
                  setDraft({ ...draft, emailLowStockDaily: checked })
                }
                aria-label={t`Email peringatan stok menipis harian`}
              />
            }
          />
        </FieldGroup>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <SaveBar dirty={dirty} onReset={reset} onSave={handleSave} />
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function GeneralSettings() {
  const { t } = useLingui();
  const { locale, setLocale } = useLocale();

  // Tampilan — density (live)
  const [density, setDensityState] = useState<Density>(() => getDensity());
  function handleDensity(v: string) {
    const d = v as Density;
    setDensityState(d);
    storeDensity(d);
    applyDensity(d);
  }

  // Tampilan — tema (live)
  const [theme, setThemeState] = useState<Theme>(() => getTheme());
  function handleTheme(v: string) {
    const t = v as Theme;
    setThemeState(t);
    storeTheme(t);
    applyTheme(t);
  }

  // Bahasa & Wilayah
  const [timezone, setTimezone] = usePreference<string>('timezone', 'Asia/Jakarta');
  const [dateFormat, setDateFormat] = usePreference<string>('dateFormat', 'dmy-short');
  const [timeFormat, setTimeFormat] = usePreference<string>('timeFormat', '24');

  // Pesanan
  const [confirmClearCart, setConfirmClearCart] = useBoolPreference('confirmClearCart', true);
  const [orderPrefix, setOrderPrefix] = usePreference<string>('orderPrefix', '');

  // Notifikasi
  const [lowStockAlerts, setLowStockAlerts] = useBoolPreference('lowStockAlerts', true);
  const [saleSound, setSaleSound] = useBoolPreference('saleSound', false);

  // Keamanan
  const [pinForVoid, setPinForVoid] = useBoolPreference('pinForVoid', true);
  const [autoLock, setAutoLock] = usePreference<string>('autoLock', 'off');

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsPageHeader
        title={<Trans>Umum</Trans>}
        description={
          <Trans>
            Bahasa, kepadatan tampilan, dan format tanggal &amp; waktu berlaku
            langsung. Pengaturan struk &amp; pembayaran kini ada di halaman Struk
            &amp; Printer dan Pajak &amp; Pembayaran.
          </Trans>
        }
      />

      <RegionSection
        locale={locale}
        setLocale={setLocale}
        timezone={timezone}
        setTimezone={setTimezone}
        dateFormat={dateFormat}
        setDateFormat={setDateFormat}
        timeFormat={timeFormat}
        setTimeFormat={setTimeFormat}
      />

      <AppearanceSection
        density={density}
        handleDensity={handleDensity}
        theme={theme}
        handleTheme={handleTheme}
      />

      <EmailSummarySection />

      <OrdersSection
        t={t}
        confirmClearCart={confirmClearCart}
        setConfirmClearCart={setConfirmClearCart}
        orderPrefix={orderPrefix}
        setOrderPrefix={setOrderPrefix}
      />

      <NotificationsSection
        t={t}
        lowStockAlerts={lowStockAlerts}
        setLowStockAlerts={setLowStockAlerts}
        saleSound={saleSound}
        setSaleSound={setSaleSound}
      />

      <SecuritySection
        t={t}
        pinForVoid={pinForVoid}
        setPinForVoid={setPinForVoid}
        autoLock={autoLock}
        setAutoLock={setAutoLock}
      />
    </div>
  );
}
