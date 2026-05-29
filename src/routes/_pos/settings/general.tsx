import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
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
import { useState } from 'react';

export const Route = createFileRoute('/_pos/settings/general')({
  component: GeneralSettings,
});

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
// Component
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

  return (
    <div className="max-w-2xl space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold mb-1">
          <Trans>Umum</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Preferensi tampilan dan regional aplikasi.</Trans>
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          <Trans>Sebagian preferensi diterapkan saat aplikasi dimuat ulang.</Trans>
        </p>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Bahasa & Wilayah                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Bahasa &amp; Wilayah</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Bahasa */}
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

            {/* Zona Waktu */}
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
                      <Trans>WIB — Jakarta</Trans>
                    </SelectItem>
                    <SelectItem value="Asia/Makassar">
                      <Trans>WITA — Makassar</Trans>
                    </SelectItem>
                    <SelectItem value="Asia/Jayapura">
                      <Trans>WIT — Jayapura</Trans>
                    </SelectItem>
                  </SelectContent>
                </Select>
              }
            />

            <RowSep />

            {/* Format Tanggal */}
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

            {/* Format Waktu */}
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

            {/* Mata Uang — read-only */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 2. Tampilan                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Tampilan</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Kepadatan tampilan — LIVE */}
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

            {/* Ukuran teks */}
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

            {/* Mode gelap — read-only */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 3. Struk & Cetak                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Struk &amp; Cetak</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Cetak struk otomatis */}
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

            {/* Ukuran kertas */}
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

            {/* Tampilkan logo di struk */}
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

            {/* Catatan kaki struk */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 4. Pembayaran                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Pembayaran</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Metode default */}
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

            {/* Pembulatan */}
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

            {/* Tombol nominal cepat */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 5. Pesanan                                                           */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Pesanan</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Konfirmasi sebelum kosongkan keranjang */}
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

            {/* Awalan nomor pesanan */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 6. Notifikasi                                                        */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Notifikasi</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Peringatan stok rendah */}
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

            {/* Suara saat transaksi berhasil */}
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

      {/* ------------------------------------------------------------------ */}
      {/* 7. Keamanan                                                          */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Keamanan</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {/* Wajib PIN untuk void/refund */}
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

            {/* Kunci otomatis saat tidak aktif */}
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
    </div>
  );
}
