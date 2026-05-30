import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import {
  RowSep,
  SettingRow,
  SettingsPageHeader,
  SettingsSection,
} from '~/components/settings/primitives';
import { SaveBar } from '~/components/settings/save-bar';
import { useEditableState } from '~/components/settings/use-editable-state';
import { Button } from '~/components/ui/button';
import { FieldGroup } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Switch } from '~/components/ui/switch';

export const Route = createFileRoute('/_pos/settings/tax')({
  component: SettingsTax,
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PaymentMethodsDraft {
  cash: boolean;
  qrisStatic: boolean;
  qrisDynamic: boolean;
  card: boolean;
  ewallet: boolean;
  transfer: boolean;
}

interface PaymentDraft {
  methods: PaymentMethodsDraft;
  defaultMethod: 'cash' | 'qris_static' | 'qris_dynamic' | 'card' | 'ewallet' | 'transfer';
  cashRounding: 'none' | 'nearest_100' | 'nearest_500' | 'nearest_1000';
  quickCashButtons: number[];
  serviceChargeEnabled: boolean;
  serviceChargePct: number;
  serviceChargeName: string;
  // Use string (never undefined) locally — map to optional only on save
  qrisMerchantName: string;
  qrisNmid: string;
}

interface TaxPaymentDraft {
  taxEnabled: boolean;
  taxRatePct: number;
  taxName: string;
  taxInclusive: boolean;
  npwp: string;
  payment: PaymentDraft;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function SettingsTax() {
  const { t } = useLingui();
  const s = useQuery(api.settings.get);

  const updateTaxPayment = useMutation(api.settings.updateTaxPayment);
  const updatePayment = useMutation(api.settings.updatePayment);

  const [error, setError] = useState<string | null>(null);
  const [newQuickCash, setNewQuickCash] = useState('');

  const initialDraft = useMemo<TaxPaymentDraft | undefined>(() => {
    if (!s) return undefined;
    return {
      taxEnabled: s.taxEnabled,
      taxRatePct: s.taxRatePct,
      taxName: s.taxName,
      taxInclusive: s.taxInclusive,
      npwp: s.npwp ?? '',
      payment: {
        methods: { ...s.payment.methods },
        defaultMethod: s.payment.defaultMethod,
        cashRounding: s.payment.cashRounding,
        quickCashButtons: [...s.payment.quickCashButtons],
        serviceChargeEnabled: s.payment.serviceChargeEnabled,
        serviceChargePct: s.payment.serviceChargePct,
        serviceChargeName: s.payment.serviceChargeName,
        qrisMerchantName:
          ('qrisMerchantName' in s.payment ? s.payment.qrisMerchantName : undefined) ?? '',
        qrisNmid: ('qrisNmid' in s.payment ? s.payment.qrisNmid : undefined) ?? '',
      },
    };
  }, [s]);

  const { draft, setDraft, dirty, reset } = useEditableState<TaxPaymentDraft>(initialDraft);

  if (s === undefined) {
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

  function patchDraft(patch: Partial<TaxPaymentDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...patch });
  }

  function patchPayment(patch: Partial<PaymentDraft>) {
    if (!draft) return;
    setDraft({ ...draft, payment: { ...draft.payment, ...patch } });
  }

  function patchMethods(patch: Partial<PaymentMethodsDraft>) {
    if (!draft) return;
    setDraft({
      ...draft,
      payment: { ...draft.payment, methods: { ...draft.payment.methods, ...patch } },
    });
  }

  function handleAddQuickCash() {
    if (!draft) return;
    const val = Number(newQuickCash);
    if (!val || val <= 0) return;
    const updated = [...draft.payment.quickCashButtons, val].sort((a, b) => a - b);
    patchPayment({ quickCashButtons: updated });
    setNewQuickCash('');
  }

  function handleRemoveQuickCash(index: number) {
    if (!draft) return;
    const updated = draft.payment.quickCashButtons.filter((_, i) => i !== index);
    patchPayment({ quickCashButtons: updated });
  }

  async function handleSave() {
    const d = draft;
    if (!d) return;
    setError(null);
    try {
      const qrisMerchantName = d.payment.qrisMerchantName.trim() || undefined;
      const qrisNmid = d.payment.qrisNmid.trim() || undefined;
      const npwp = d.npwp.trim() || undefined;

      // Build payment payload — avoid assigning `undefined` to optional fields
      // (exactOptionalPropertyTypes requires the property to be absent, not undefined)
      const paymentPayload = {
        methods: d.payment.methods,
        defaultMethod: d.payment.defaultMethod,
        cashRounding: d.payment.cashRounding,
        quickCashButtons: d.payment.quickCashButtons,
        serviceChargeEnabled: d.payment.serviceChargeEnabled,
        serviceChargePct: d.payment.serviceChargePct,
        serviceChargeName: d.payment.serviceChargeName,
        ...(qrisMerchantName !== undefined ? { qrisMerchantName } : {}),
        ...(qrisNmid !== undefined ? { qrisNmid } : {}),
      };

      await Promise.all([
        updateTaxPayment({
          taxRatePct: d.taxRatePct,
          taxEnabled: d.taxEnabled,
          taxName: d.taxName,
          taxInclusive: d.taxInclusive,
          ...(npwp !== undefined ? { npwp } : {}),
        }),
        updatePayment({ payment: paymentPayload }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal menyimpan.`);
      throw e;
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 max-w-2xl">
      <SettingsPageHeader
        title={<Trans>Pajak & Pembayaran</Trans>}
        description={<Trans>Atur pajak, biaya layanan, dan metode pembayaran.</Trans>}
      />

      {/* ------------------------------------------------------------------ */}
      {/* 1. Pajak                                                             */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Pajak</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Aktifkan pajak</Trans>}
            control={
              <Switch
                checked={draft.taxEnabled}
                onCheckedChange={(checked) => patchDraft({ taxEnabled: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Nama pajak</Trans>}
            description={<Trans>Mis. PB1 atau PPN.</Trans>}
            control={
              <Input
                value={draft.taxName}
                onChange={(e) => patchDraft({ taxName: e.target.value })}
                placeholder="PB1"
                className="w-40"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Persentase pajak</Trans>}
            control={
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={draft.taxRatePct}
                  onChange={(e) => patchDraft({ taxRatePct: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Harga sudah termasuk pajak</Trans>}
            description={<Trans>Jika aktif, harga menu dianggap sudah termasuk pajak.</Trans>}
            control={
              <Switch
                checked={draft.taxInclusive}
                onCheckedChange={(checked) => patchDraft({ taxInclusive: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>NPWP (opsional)</Trans>}
            control={
              <Input
                value={draft.npwp}
                onChange={(e) => patchDraft({ npwp: e.target.value })}
                className="w-52"
              />
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Biaya layanan                                                     */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Biaya layanan</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Aktifkan biaya layanan</Trans>}
            control={
              <Switch
                checked={draft.payment.serviceChargeEnabled}
                onCheckedChange={(checked) => patchPayment({ serviceChargeEnabled: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Nama</Trans>}
            control={
              <Input
                value={draft.payment.serviceChargeName}
                onChange={(e) => patchPayment({ serviceChargeName: e.target.value })}
                className="w-52"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Persentase</Trans>}
            control={
              <div className="flex items-center gap-1.5">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.payment.serviceChargePct}
                  onChange={(e) => patchPayment({ serviceChargePct: Number(e.target.value) })}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 3. Metode pembayaran                                                 */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Metode pembayaran</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Tunai</Trans>}
            control={
              <Switch
                checked={draft.payment.methods.cash}
                onCheckedChange={(checked) => patchMethods({ cash: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>QRIS statis</Trans>}
            control={
              <Switch
                checked={draft.payment.methods.qrisStatic}
                onCheckedChange={(checked) => patchMethods({ qrisStatic: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>QRIS dinamis</Trans>}
            control={
              <Switch
                checked={draft.payment.methods.qrisDynamic}
                onCheckedChange={(checked) => patchMethods({ qrisDynamic: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Kartu debit/kredit</Trans>}
            control={
              <Switch
                checked={draft.payment.methods.card}
                onCheckedChange={(checked) => patchMethods({ card: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>E-wallet</Trans>}
            control={
              <Switch
                checked={draft.payment.methods.ewallet}
                onCheckedChange={(checked) => patchMethods({ ewallet: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Transfer bank</Trans>}
            control={
              <Switch
                checked={draft.payment.methods.transfer}
                onCheckedChange={(checked) => patchMethods({ transfer: checked })}
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Metode default</Trans>}
            control={
              <Select
                value={draft.payment.defaultMethod}
                onValueChange={(v) =>
                  patchPayment({
                    defaultMethod: v as PaymentDraft['defaultMethod'],
                  })
                }
              >
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">
                    <Trans>Tunai</Trans>
                  </SelectItem>
                  <SelectItem value="qris_static">
                    <Trans>QRIS statis</Trans>
                  </SelectItem>
                  <SelectItem value="qris_dynamic">
                    <Trans>QRIS dinamis</Trans>
                  </SelectItem>
                  <SelectItem value="card">
                    <Trans>Kartu</Trans>
                  </SelectItem>
                  <SelectItem value="ewallet">
                    <Trans>E-wallet</Trans>
                  </SelectItem>
                  <SelectItem value="transfer">
                    <Trans>Transfer</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 4. Tunai                                                             */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>Tunai</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Pembulatan</Trans>}
            control={
              <Select
                value={draft.payment.cashRounding}
                onValueChange={(v) =>
                  patchPayment({ cashRounding: v as PaymentDraft['cashRounding'] })
                }
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <Trans>Tanpa pembulatan</Trans>
                  </SelectItem>
                  <SelectItem value="nearest_100">
                    <Trans>Rp100 terdekat</Trans>
                  </SelectItem>
                  <SelectItem value="nearest_500">
                    <Trans>Rp500 terdekat</Trans>
                  </SelectItem>
                  <SelectItem value="nearest_1000">
                    <Trans>Rp1.000 terdekat</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>Tombol uang cepat</Trans>}
            control={
              <div className="flex flex-col gap-2 items-end">
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {draft.payment.quickCashButtons.map((amount, i) => (
                    <Button
                      // biome-ignore lint/suspicious/noArrayIndexKey: list is sorted and remove uses index; amount may repeat
                      key={i}
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveQuickCash(i)}
                      className="gap-1 text-xs"
                    >
                      {amount.toLocaleString('id-ID')}
                      <span aria-hidden="true">×</span>
                    </Button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={newQuickCash}
                    onChange={(e) => setNewQuickCash(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddQuickCash();
                      }
                    }}
                    placeholder="50000"
                    className="w-28"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddQuickCash}>
                    <Trans>Tambah</Trans>
                  </Button>
                </div>
              </div>
            }
          />
        </FieldGroup>
      </SettingsSection>

      {/* ------------------------------------------------------------------ */}
      {/* 5. QRIS                                                              */}
      {/* ------------------------------------------------------------------ */}
      <SettingsSection title={<Trans>QRIS</Trans>}>
        <FieldGroup>
          <SettingRow
            label={<Trans>Nama merchant</Trans>}
            control={
              <Input
                value={draft.payment.qrisMerchantName ?? ''}
                onChange={(e) => patchPayment({ qrisMerchantName: e.target.value })}
                className="w-52"
              />
            }
          />

          <RowSep />

          <SettingRow
            label={<Trans>NMID</Trans>}
            control={
              <Input
                value={draft.payment.qrisNmid ?? ''}
                onChange={(e) => patchPayment({ qrisNmid: e.target.value })}
                className="w-52"
              />
            }
          />
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
