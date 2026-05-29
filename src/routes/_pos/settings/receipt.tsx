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
  const { t } = useLingui();

  const headerName = draft.headerText.trim() || cafeName;
  const footerText = draft.footerText.trim() || t`Terima kasih 🙏`;
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

      {/* Cafe name / header */}
      <div className="font-bold text-center">{headerName}</div>

      {/* Address */}
      {draft.showAddress && cafeAddress && (
        <div className="text-center">{cafeAddress}</div>
      )}

      {/* Phone */}
      {draft.showPhone && cafePhone && (
        <div className="text-center">{cafePhone}</div>
      )}

      <div className="border-t border-dashed border-black my-1" />

      {/* Order number — hardcoded sample */}
      {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
      {draft.showOrderNumber && <div>No: {prefix}001</div>}

      {/* Cashier — hardcoded sample */}
      {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
      {draft.showCashier && <div>Kasir: Andi</div>}

      {/* Items — hardcoded sample data */}
      {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
      <div>Kopi Susu x1 ........ 18.000</div>
      {draft.showItemModifiers && (
        // eslint-disable-next-line lingui/no-unlocalized-strings
        <div className="pl-2">+ Less sugar</div>
      )}
      {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
      <div>Croissant x2 ...... 40.000</div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Totals — hardcoded sample data */}
      {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
      <div>Subtotal ... 58.000</div>
      {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
      {draft.showTaxBreakdown && <div>Pajak 11% ... 6.380</div>}
      {/* eslint-disable-next-line lingui/no-unlocalized-strings */}
      <div className="font-bold">TOTAL ... 64.380</div>

      <div className="border-t border-dashed border-black my-1" />

      {/* Footer */}
      <div className="text-center">{footerText}</div>
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
                    placeholder={t`Terima kasih 🙏`}
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
