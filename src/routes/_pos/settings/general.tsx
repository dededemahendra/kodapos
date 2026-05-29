import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useLocale } from '~/components/locale-provider';
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
  getDensity,
  storeDensity,
  type Density,
  useBoolPreference,
  usePreference,
} from '~/lib/preferences';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/_pos/settings/general')({
  component: GeneralSettings,
});

// ---------------------------------------------------------------------------
// Section IDs
// ---------------------------------------------------------------------------

type SectionId =
  | 'region'
  | 'appearance'
  | 'receipt'
  | 'payment'
  | 'orders'
  | 'notifications'
  | 'security';

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
  fontSize,
  setFontSize,
}: {
  density: Density;
  handleDensity: (v: string) => void;
  fontSize: string;
  setFontSize: (v: string) => void;
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
            label={<Trans>Ukuran teks</Trans>}
            description={<Trans>Ukuran font dasar antarmuka.</Trans>}
            control={
              <Select value={fontSize} onValueChange={setFontSize}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">
                    <Trans>Kecil</Trans>
                  </SelectItem>
                  <SelectItem value="normal">
                    <Trans>Normal</Trans>
                  </SelectItem>
                  <SelectItem value="large">
                    <Trans>Besar</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Mode gelap</Trans>}
            description={<Trans>Mengikuti sistem.</Trans>}
            control={
              <span className="text-sm text-muted-foreground">
                <Trans>Mengikuti sistem.</Trans>
              </span>
            }
          />
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function ReceiptSection({
  t,
  autoPrint,
  setAutoPrint,
  paperSize,
  setPaperSize,
  receiptLogo,
  setReceiptLogo,
  receiptFooter,
  setReceiptFooter,
}: {
  t: (s: TemplateStringsArray, ...args: unknown[]) => string;
  autoPrint: boolean;
  setAutoPrint: (v: boolean) => void;
  paperSize: string;
  setPaperSize: (v: string) => void;
  receiptLogo: boolean;
  setReceiptLogo: (v: boolean) => void;
  receiptFooter: string;
  setReceiptFooter: (v: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Struk &amp; Cetak</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Cetak struk otomatis</Trans>}
            description={<Trans>Langsung cetak setelah pembayaran berhasil.</Trans>}
            control={
              <Switch
                checked={autoPrint}
                onCheckedChange={setAutoPrint}
                aria-label={t`Cetak struk otomatis`}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Ukuran kertas</Trans>}
            description={<Trans>Sesuaikan dengan lebar gulungan printer Anda.</Trans>}
            control={
              <Select value={paperSize} onValueChange={setPaperSize}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="80">80 mm</SelectItem>
                  <SelectItem value="58">58 mm</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Tampilkan logo di struk</Trans>}
            description={<Trans>Cetak logo kafe di bagian atas struk.</Trans>}
            control={
              <Switch
                checked={receiptLogo}
                onCheckedChange={setReceiptLogo}
                aria-label={t`Tampilkan logo di struk`}
              />
            }
          />

          <RowSep />

          <Field orientation="vertical">
            <FieldTitle>
              <Trans>Catatan kaki struk</Trans>
            </FieldTitle>
            <FieldDescription>
              <Trans>Teks yang dicetak di bagian bawah struk.</Trans>
            </FieldDescription>
            <Input
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              placeholder={t`mis. Terima kasih telah berbelanja`}
              className="mt-1.5"
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
}

function PaymentSection({
  t,
  defaultPayment,
  setDefaultPayment,
  rounding,
  setRounding,
  quickCash,
  setQuickCash,
}: {
  t: (s: TemplateStringsArray, ...args: unknown[]) => string;
  defaultPayment: string;
  setDefaultPayment: (v: string) => void;
  rounding: string;
  setRounding: (v: string) => void;
  quickCash: boolean;
  setQuickCash: (v: boolean) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">
          <Trans>Pembayaran</Trans>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <SettingRow
            label={<Trans>Metode default</Trans>}
            description={<Trans>Metode pembayaran yang dipilih saat checkout.</Trans>}
            control={
              <Select value={defaultPayment} onValueChange={setDefaultPayment}>
                <SelectTrigger className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <Trans>Tunai</Trans>
                  </SelectItem>
                  <SelectItem value="qris">QRIS</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Pembulatan</Trans>}
            description={<Trans>Bulatkan total transaksi ke satuan terdekat.</Trans>}
            control={
              <Select value={rounding} onValueChange={setRounding}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <Trans>Tanpa pembulatan</Trans>
                  </SelectItem>
                  <SelectItem value="100">Rp 100</SelectItem>
                  <SelectItem value="500">Rp 500</SelectItem>
                  <SelectItem value="1000">Rp 1.000</SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Tombol nominal cepat</Trans>}
            description={<Trans>Tampilkan tombol nominal saat pembayaran tunai.</Trans>}
            control={
              <Switch
                checked={quickCash}
                onCheckedChange={setQuickCash}
                aria-label={t`Tombol nominal cepat`}
              />
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
// Section nav definitions
// ---------------------------------------------------------------------------

const SECTIONS: { id: SectionId; label: React.ReactNode }[] = [
  { id: 'region', label: <Trans>Bahasa &amp; Wilayah</Trans> },
  { id: 'appearance', label: <Trans>Tampilan</Trans> },
  { id: 'receipt', label: <Trans>Struk &amp; Cetak</Trans> },
  { id: 'payment', label: <Trans>Pembayaran</Trans> },
  { id: 'orders', label: <Trans>Pesanan</Trans> },
  { id: 'notifications', label: <Trans>Notifikasi</Trans> },
  { id: 'security', label: <Trans>Keamanan</Trans> },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function GeneralSettings() {
  const { t } = useLingui();
  const { locale, setLocale } = useLocale();

  // Active section
  const [activeSection, setActiveSection] = useState<SectionId>('region');

  // Tampilan — density (live)
  const [density, setDensityState] = useState<Density>(() => getDensity());
  function handleDensity(v: string) {
    const d = v as Density;
    setDensityState(d);
    storeDensity(d);
    applyDensity(d);
  }

  // Bahasa & Wilayah
  const [timezone, setTimezone] = usePreference<string>('timezone', 'Asia/Jakarta');
  const [dateFormat, setDateFormat] = usePreference<string>('dateFormat', 'dmy-short');
  const [timeFormat, setTimeFormat] = usePreference<string>('timeFormat', '24');

  // Tampilan
  const [fontSize, setFontSize] = usePreference<string>('fontSize', 'normal');

  // Struk & Cetak
  const [autoPrint, setAutoPrint] = useBoolPreference('autoPrint', false);
  const [paperSize, setPaperSize] = usePreference<string>('paperSize', '80');
  const [receiptLogo, setReceiptLogo] = useBoolPreference('receiptLogo', true);
  const [receiptFooter, setReceiptFooter] = usePreference<string>('receiptFooter', '');

  // Pembayaran
  const [defaultPayment, setDefaultPayment] = usePreference<string>('defaultPayment', 'cash');
  const [rounding, setRounding] = usePreference<string>('rounding', 'none');
  const [quickCash, setQuickCash] = useBoolPreference('quickCash', true);

  // Pesanan
  const [confirmClearCart, setConfirmClearCart] = useBoolPreference('confirmClearCart', true);
  const [orderPrefix, setOrderPrefix] = usePreference<string>('orderPrefix', '');

  // Notifikasi
  const [lowStockAlerts, setLowStockAlerts] = useBoolPreference('lowStockAlerts', true);
  const [saleSound, setSaleSound] = useBoolPreference('saleSound', false);

  // Keamanan
  const [pinForVoid, setPinForVoid] = useBoolPreference('pinForVoid', true);
  const [autoLock, setAutoLock] = usePreference<string>('autoLock', 'off');

  function renderSection() {
    switch (activeSection) {
      case 'region':
        return (
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
        );
      case 'appearance':
        return (
          <AppearanceSection
            density={density}
            handleDensity={handleDensity}
            fontSize={fontSize}
            setFontSize={setFontSize}
          />
        );
      case 'receipt':
        return (
          <ReceiptSection
            t={t}
            autoPrint={autoPrint}
            setAutoPrint={setAutoPrint}
            paperSize={paperSize}
            setPaperSize={setPaperSize}
            receiptLogo={receiptLogo}
            setReceiptLogo={setReceiptLogo}
            receiptFooter={receiptFooter}
            setReceiptFooter={setReceiptFooter}
          />
        );
      case 'payment':
        return (
          <PaymentSection
            t={t}
            defaultPayment={defaultPayment}
            setDefaultPayment={setDefaultPayment}
            rounding={rounding}
            setRounding={setRounding}
            quickCash={quickCash}
            setQuickCash={setQuickCash}
          />
        );
      case 'orders':
        return (
          <OrdersSection
            t={t}
            confirmClearCart={confirmClearCart}
            setConfirmClearCart={setConfirmClearCart}
            orderPrefix={orderPrefix}
            setOrderPrefix={setOrderPrefix}
          />
        );
      case 'notifications':
        return (
          <NotificationsSection
            t={t}
            lowStockAlerts={lowStockAlerts}
            setLowStockAlerts={setLowStockAlerts}
            saleSound={saleSound}
            setSaleSound={setSaleSound}
          />
        );
      case 'security':
        return (
          <SecuritySection
            t={t}
            pinForVoid={pinForVoid}
            setPinForVoid={setPinForVoid}
            autoLock={autoLock}
            setAutoLock={setAutoLock}
          />
        );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">
          <Trans>Umum</Trans>
        </h1>
        <p className="text-muted-foreground text-xs mt-1">
          <Trans>Sebagian preferensi diterapkan saat aplikasi dimuat ulang.</Trans>
        </p>
      </div>

      {/* Two-pane layout */}
      <div className="flex gap-6">
        {/* Section rail */}
        <nav className="w-52 shrink-0 flex flex-col gap-1">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={cn(
                'text-left text-sm px-3 py-1.5 rounded-md transition-colors',
                activeSection === id
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Section content */}
        <div className="flex-1 min-w-0">{renderSection()}</div>
      </div>
    </div>
  );
}
