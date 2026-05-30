import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
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
import { Switch } from '~/components/ui/switch';
import { FieldGroup } from '~/components/ui/field';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/_pos/settings/receipt')({
  component: SettingsReceipt,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReceiptDraft {
  headerText: string;
  footerText: string;
  orderNumberPrefix: string;
  showLogo: boolean;
  showAddress: boolean;
  showPhone: boolean;
  showCashier: boolean;
  showOrderNumber: boolean;
  showItemModifiers: boolean;
  showTaxBreakdown: boolean;
  paperSize: '58mm' | '80mm';
  fontSize: 'small' | 'normal' | 'large';
  autoPrint: boolean;
  printCopies: number;
  printerType: 'bluetooth' | 'usb' | 'network';
  openDrawer: boolean;
}

// ---------------------------------------------------------------------------
// Live receipt preview
// ---------------------------------------------------------------------------

// The printed receipt is ALWAYS in English, independent of the app's UI
// locale, so this sample content is intentionally hardcoded English and kept
// out of the i18n catalog. Menu item names keep their original names.
/* eslint-disable lingui/no-unlocalized-strings */
const SAMPLE_RECEIPT = {
  tagline: 'Coffee & Eatery',
  address: 'Jl. Merdeka No. 10, Jakarta',
  telLabel: 'Tel:',
  phone: '0812-3456-7890',
  npwp: 'NPWP 01.234.567.8-901.000',
  receiptTitle: 'SALES RECEIPT',
  dateTime: '30/05/2026  14:32',
  orderLabel: 'Order',
  orderNo: '001',
  table: 'Table 4',
  cashier: 'Cashier: Andi',
  orderType: 'Type: Dine-in',
  items: [
    { name: 'Kopi Susu', total: '18.000', qtyLine: '1 × 18.000', mod: '+ Less sugar' },
    { name: 'Croissant', total: '40.000', qtyLine: '2 × 20.000', mod: '+ Extra butter' },
    { name: 'Teh Tarik', total: '15.000', qtyLine: '1 × 15.000', mod: null },
  ],
  charges: [
    { label: 'Subtotal', value: '73.000' },
    { label: 'Discount', value: '0' },
    { label: 'Service 5%', value: '3.650' },
  ],
  tax: { label: 'Tax 11%', value: '8.430' },
  total: { label: 'TOTAL', value: '85.080' },
  payments: [
    { label: 'Cash', value: '100.000' },
    { label: 'Change', value: '14.920' },
  ],
  poweredBy: 'Powered by Kodapos',
  defaultFooter: 'Thank you for your visit',
};
/* eslint-enable lingui/no-unlocalized-strings */

/** One left-label / right-value line on the receipt. */
function RcptRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className={cn('flex justify-between gap-2', bold && 'font-bold text-[1.1em]')}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function ReceiptPreview({
  draft,
  cafeName,
  cafeAddress,
  cafePhone,
  cafeLogoUrl,
}: {
  draft: ReceiptDraft;
  cafeName: string;
  cafeAddress?: string;
  cafePhone?: string;
  cafeLogoUrl?: string;
}) {
  const headerName = draft.headerText.trim() || cafeName;
  const footerText = draft.footerText.trim() || SAMPLE_RECEIPT.defaultFooter;
  const prefix = draft.orderNumberPrefix ?? '';

  return (
    <div
      className={cn(
        'rounded border bg-white text-black font-mono mx-auto p-3',
        draft.paperSize === '58mm' ? 'w-[200px]' : 'w-[280px]',
        draft.fontSize === 'small'
          ? 'text-[10px]'
          : draft.fontSize === 'large'
            ? 'text-sm'
            : 'text-xs'
      )}
    >
      {/* Logo */}
      {draft.showLogo && cafeLogoUrl && (
        <div className="flex justify-center mb-1">
          <img src={cafeLogoUrl} alt={cafeName} className="h-8 w-8 object-contain" />
        </div>
      )}

      {/* Cafe name + tagline */}
      <div className="font-bold text-center text-[1.25em] leading-tight tracking-wide uppercase">
        {headerName}
      </div>
      <div className="text-center opacity-70">{SAMPLE_RECEIPT.tagline}</div>

      {/* Address */}
      {draft.showAddress && (
        <div className="text-center mt-1">{cafeAddress || SAMPLE_RECEIPT.address}</div>
      )}

      {/* Phone */}
      {draft.showPhone && (
        <div className="text-center">
          {`${SAMPLE_RECEIPT.telLabel} ${cafePhone || SAMPLE_RECEIPT.phone}`}
        </div>
      )}

      {/* Tax id */}
      <div className="text-center opacity-70">{SAMPLE_RECEIPT.npwp}</div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Receipt title */}
      <div className="text-center font-semibold tracking-[0.2em]">
        {SAMPLE_RECEIPT.receiptTitle}
      </div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Order meta — always-English sample (see SAMPLE_RECEIPT) */}
      {draft.showOrderNumber && (
        <RcptRow
          label={`${SAMPLE_RECEIPT.orderLabel} ${prefix}${SAMPLE_RECEIPT.orderNo}`}
          value={SAMPLE_RECEIPT.table}
        />
      )}
      <div>{SAMPLE_RECEIPT.dateTime}</div>
      {draft.showCashier && <div>{SAMPLE_RECEIPT.cashier}</div>}
      <div>{SAMPLE_RECEIPT.orderType}</div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Items */}
      <div className="space-y-1">
        {SAMPLE_RECEIPT.items.map((it) => (
          <div key={it.name}>
            <div className="flex justify-between gap-2">
              <span>{it.name}</span>
              <span>{it.total}</span>
            </div>
            <div className="opacity-70">{it.qtyLine}</div>
            {draft.showItemModifiers && it.mod && (
              <div className="pl-2 opacity-70">{it.mod}</div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Charges + total */}
      {SAMPLE_RECEIPT.charges.map((c) => (
        <RcptRow key={c.label} label={c.label} value={c.value} />
      ))}
      {draft.showTaxBreakdown && (
        <RcptRow label={SAMPLE_RECEIPT.tax.label} value={SAMPLE_RECEIPT.tax.value} />
      )}
      <RcptRow label={SAMPLE_RECEIPT.total.label} value={SAMPLE_RECEIPT.total.value} bold />

      <div className="border-t border-dashed border-black my-1" />

      {/* Payment */}
      {SAMPLE_RECEIPT.payments.map((p) => (
        <RcptRow key={p.label} label={p.label} value={p.value} />
      ))}

      <div className="border-t border-dashed border-black my-1" />

      {/* Footer */}
      <div className="text-center">{footerText}</div>
      <div className="text-center mt-1 opacity-70">{SAMPLE_RECEIPT.poweredBy}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function SettingsReceipt() {
  const { t } = useLingui();
  const s = useQuery(api.settings.get);
  const cafe = useQuery(api.cafes.myCafe);
  const updateReceipt = useMutation(api.settings.updateReceipt);

  const [error, setError] = useState<string | null>(null);

  const initialDraft = useMemo<ReceiptDraft | undefined>(() => {
    if (!s) return undefined;
    const r = s.receipt;
    // The inferred union type from `row?.receipt ?? DEFAULT_SETTINGS.receipt`
    // omits optional fields on one branch; cast to access them safely.
    const rx = r as typeof r & {
      headerText?: string;
      footerText?: string;
      orderNumberPrefix?: string;
    };
    return {
      headerText: rx.headerText ?? '',
      footerText: rx.footerText ?? '',
      orderNumberPrefix: rx.orderNumberPrefix ?? '',
      showLogo: r.showLogo,
      showAddress: r.showAddress,
      showPhone: r.showPhone,
      showCashier: r.showCashier,
      showOrderNumber: r.showOrderNumber,
      showItemModifiers: r.showItemModifiers,
      showTaxBreakdown: r.showTaxBreakdown,
      paperSize: r.paperSize,
      fontSize: r.fontSize,
      autoPrint: r.autoPrint,
      printCopies: r.printCopies,
      printerType: r.printerType,
      openDrawer: r.openDrawer,
    };
  }, [s]);

  const { draft, setDraft, dirty, reset } = useEditableState<ReceiptDraft>(initialDraft);

  if (s === undefined || cafe === undefined) {
    return (
      <p className="text-muted-foreground">
        <Trans>Memuat…</Trans>
      </p>
    );
  }

  if (!draft) return null;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function setField<K extends keyof ReceiptDraft>(key: K, value: ReceiptDraft[K]) {
    setDraft({ ...draft!, [key]: value });
  }

  async function handleSave() {
    const d = draft;
    if (!d) return;
    setError(null);
    const trimOrUndef = (v: string) => v.trim() || undefined;
    const ht = trimOrUndef(d.headerText);
    const ft = trimOrUndef(d.footerText);
    const op = trimOrUndef(d.orderNumberPrefix);
    const payload = {
      ...(ht !== undefined ? { headerText: ht } : {}),
      ...(ft !== undefined ? { footerText: ft } : {}),
      ...(op !== undefined ? { orderNumberPrefix: op } : {}),
      showLogo: d.showLogo,
      showAddress: d.showAddress,
      showPhone: d.showPhone,
      showCashier: d.showCashier,
      showOrderNumber: d.showOrderNumber,
      showItemModifiers: d.showItemModifiers,
      showTaxBreakdown: d.showTaxBreakdown,
      paperSize: d.paperSize,
      fontSize: d.fontSize,
      autoPrint: d.autoPrint,
      printCopies: Math.min(5, Math.max(1, d.printCopies)),
      printerType: d.printerType,
      openDrawer: d.openDrawer,
    };
    try {
      await updateReceipt({ receipt: payload });
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal menyimpan.`);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      <SettingsPageHeader
        title={<Trans>Struk &amp; Printer</Trans>}
        description={<Trans>Atur isi struk, ukuran kertas, dan printer.</Trans>}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* ---------------------------------------------------------------- */}
        {/* Left column — settings sections                                   */}
        {/* ---------------------------------------------------------------- */}
        <div className="space-y-6">
          {/* 1. Konten struk */}
          <SettingsSection title={<Trans>Konten struk</Trans>}>
            <FieldGroup>
              <SettingRow
                label={<Trans>Teks header</Trans>}
                control={
                  <Input
                    value={draft.headerText}
                    onChange={(e) => setField('headerText', e.target.value)}
                    placeholder={cafe?.name ?? t`Nama kafe`}
                    className="w-56"
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Teks footer</Trans>}
                control={
                  <Input
                    value={draft.footerText}
                    onChange={(e) => setField('footerText', e.target.value)}
                    placeholder={SAMPLE_RECEIPT.defaultFooter}
                    className="w-56"
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Awalan nomor order</Trans>}
                control={
                  <Input
                    value={draft.orderNumberPrefix}
                    onChange={(e) => setField('orderNumberPrefix', e.target.value)}
                    placeholder="A-"
                    className="w-28"
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Tampilkan logo</Trans>}
                control={
                  <Switch
                    checked={draft.showLogo}
                    onCheckedChange={(v) => setField('showLogo', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Tampilkan alamat</Trans>}
                control={
                  <Switch
                    checked={draft.showAddress}
                    onCheckedChange={(v) => setField('showAddress', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Tampilkan no. HP</Trans>}
                control={
                  <Switch
                    checked={draft.showPhone}
                    onCheckedChange={(v) => setField('showPhone', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Tampilkan kasir</Trans>}
                control={
                  <Switch
                    checked={draft.showCashier}
                    onCheckedChange={(v) => setField('showCashier', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Tampilkan nomor order</Trans>}
                control={
                  <Switch
                    checked={draft.showOrderNumber}
                    onCheckedChange={(v) => setField('showOrderNumber', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Tampilkan modifier item</Trans>}
                control={
                  <Switch
                    checked={draft.showItemModifiers}
                    onCheckedChange={(v) => setField('showItemModifiers', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Tampilkan rincian pajak</Trans>}
                control={
                  <Switch
                    checked={draft.showTaxBreakdown}
                    onCheckedChange={(v) => setField('showTaxBreakdown', v)}
                  />
                }
              />
            </FieldGroup>
          </SettingsSection>

          {/* 2. Tampilan */}
          <SettingsSection title={<Trans>Tampilan</Trans>}>
            <FieldGroup>
              <SettingRow
                label={<Trans>Ukuran kertas</Trans>}
                control={
                  <Select
                    value={draft.paperSize}
                    onValueChange={(v) => setField('paperSize', v as '58mm' | '80mm')}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58mm"><Trans>58 mm</Trans></SelectItem>
                      <SelectItem value="80mm"><Trans>80 mm</Trans></SelectItem>
                    </SelectContent>
                  </Select>
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Ukuran font</Trans>}
                control={
                  <Select
                    value={draft.fontSize}
                    onValueChange={(v) =>
                      setField('fontSize', v as 'small' | 'normal' | 'large')
                    }
                  >
                    <SelectTrigger className="w-32">
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
            </FieldGroup>
          </SettingsSection>

          {/* 3. Printer */}
          <SettingsSection title={<Trans>Printer</Trans>}>
            <FieldGroup>
              <SettingRow
                label={<Trans>Cetak otomatis</Trans>}
                description={
                  <Trans>Cetak struk otomatis setelah pembayaran.</Trans>
                }
                control={
                  <Switch
                    checked={draft.autoPrint}
                    onCheckedChange={(v) => setField('autoPrint', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Jumlah salinan</Trans>}
                control={
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={draft.printCopies}
                    onChange={(e) =>
                      setField(
                        'printCopies',
                        Math.min(5, Math.max(1, Number(e.target.value)))
                      )
                    }
                    className="w-20"
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Jenis printer</Trans>}
                control={
                  <Select
                    value={draft.printerType}
                    onValueChange={(v) =>
                      setField('printerType', v as 'bluetooth' | 'usb' | 'network')
                    }
                  >
                    <SelectTrigger className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bluetooth"><Trans>Bluetooth</Trans></SelectItem>
                      <SelectItem value="usb"><Trans>USB</Trans></SelectItem>
                      <SelectItem value="network">
                        <Trans>Jaringan</Trans>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Buka laci kas</Trans>}
                control={
                  <Switch
                    checked={draft.openDrawer}
                    onCheckedChange={(v) => setField('openDrawer', v)}
                  />
                }
              />

              <RowSep />

              <SettingRow
                label={<Trans>Test cetak</Trans>}
                control={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.alert(t`Fitur cetak akan tersedia segera.`)
                    }
                  >
                    <Trans>Test cetak</Trans>
                  </Button>
                }
              />
            </FieldGroup>
          </SettingsSection>

          {/* Error + SaveBar */}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <SaveBar dirty={dirty} onReset={reset} onSave={handleSave} />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Right column — live receipt preview                               */}
        {/* ---------------------------------------------------------------- */}
        <div className="lg:sticky lg:top-4">
          <p className="text-muted-foreground text-xs mb-2">
            <Trans>Pratinjau</Trans>
          </p>
          <ReceiptPreview
            draft={draft}
            cafeName={cafe?.name ?? t`Nama Kafe`}
            {...(cafe?.addressLine ? { cafeAddress: cafe.addressLine } : {})}
            {...(cafe?.phone ? { cafePhone: cafe.phone } : {})}
            {...(cafe?.logoUrl ? { cafeLogoUrl: cafe.logoUrl } : {})}
          />
        </div>
      </div>
    </div>
  );
}
