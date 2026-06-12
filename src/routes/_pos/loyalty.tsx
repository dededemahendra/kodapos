import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { LoyaltyTier } from 'convex/lib/loyalty';
import { useMutation, useQuery } from 'convex/react';
import { Award, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { RowSep, SettingRow, SettingsSection } from '~/components/settings/primitives';
import { SaveBar } from '~/components/settings/save-bar';
import { useEditableState } from '~/components/settings/use-editable-state';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { FieldError, FieldGroup } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { PageHeader } from '~/components/ui/page-header';
import { Switch } from '~/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { formatCount, formatIDR } from '~/lib/formater';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/loyalty')({ component: LoyaltyPage });

interface ConfigDraft {
  enabled: boolean;
  earnRatePerIDR: number;
  redeemBlockPoints: number;
  redeemBlockIDR: number;
  tiers: LoyaltyTier[];
}

/** Parse an integer input, clamping to a non-negative number (NaN → 0). */
function toInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

/** Parse a float input (NaN → 1, the neutral multiplier). */
function toFloat(value: string): number {
  const n = Number.parseFloat(value);
  return Number.isNaN(n) ? 1 : n;
}

function LoyaltyPage() {
  const { t } = useLingui();
  const config = useQuery(api.loyalty.getConfig);
  const stats = useQuery(api.loyalty.stats);
  const updateConfig = useMutation(api.loyalty.updateConfig);

  // Seed the draft with `tiers` always an array so the editor binds cleanly.
  const seed: ConfigDraft | undefined = config && { ...config, tiers: config.tiers ?? [] };
  const { draft, setDraft, dirty, reset } = useEditableState<ConfigDraft>(seed);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<ConfigDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...p });
  }

  function patchTier(index: number, p: Partial<LoyaltyTier>) {
    if (!draft) return;
    patch({ tiers: draft.tiers.map((tier, i) => (i === index ? { ...tier, ...p } : tier)) });
  }

  function addTier() {
    if (!draft) return;
    patch({ tiers: [...draft.tiers, { name: '', minSpendIDR: 0, earnMultiplier: 1 }] });
  }

  function removeTier(index: number) {
    if (!draft) return;
    patch({ tiers: draft.tiers.filter((_, i) => i !== index) });
  }

  async function handleSave() {
    if (!draft) return;
    setError(null);

    // Drop rows with an empty name; normalize the rest.
    const tiers: LoyaltyTier[] = draft.tiers
      .filter((tier) => tier.name.trim().length > 0)
      .map((tier) => ({
        name: tier.name.trim(),
        minSpendIDR: Number.isNaN(tier.minSpendIDR) ? 0 : tier.minSpendIDR,
        earnMultiplier: Number.isNaN(tier.earnMultiplier) ? 1 : tier.earnMultiplier,
      }));

    // Client-side guard: every multiplier must be ≥ 1.
    if (tiers.some((tier) => tier.earnMultiplier < 1)) {
      const msg = t`Pengali poin minimal 1.`;
      setError(msg);
      toast.error(msg);
      return;
    }

    try {
      await updateConfig({
        enabled: draft.enabled,
        earnRatePerIDR: draft.earnRatePerIDR,
        redeemBlockPoints: draft.redeemBlockPoints,
        redeemBlockIDR: draft.redeemBlockIDR,
        tiers,
      });
      toast.success(t`Pengaturan loyalitas disimpan.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal menyimpan.`);
      throw e;
    }
  }

  return (
    <main className="p-6">
      <PageHeader
        title={<Trans>Loyalitas</Trans>}
        description={<Trans>Atur program poin dan lihat ringkasannya.</Trans>}
      />

      <div className="max-w-2xl space-y-6">
        {/* ---------------------------------------------------------------- */}
        {/* Program config                                                    */}
        {/* ---------------------------------------------------------------- */}
        {config === undefined || !draft ? (
          <p className="text-muted-foreground text-sm">
            <Trans>Memuat…</Trans>
          </p>
        ) : (
          <>
            <SettingsSection
              title={<Trans>Program poin</Trans>}
              description={<Trans>Atur cara pelanggan memperoleh dan menukar poin.</Trans>}
            >
              <FieldGroup>
                <SettingRow
                  label={<Trans>Program aktif</Trans>}
                  description={<Trans>Jika nonaktif, pelanggan tidak memperoleh poin.</Trans>}
                  control={
                    <Switch
                      checked={draft.enabled}
                      onCheckedChange={(checked) => patch({ enabled: checked })}
                    />
                  }
                />

                <RowSep />

                <SettingRow
                  label={<Trans>Perolehan poin</Trans>}
                  description={<Trans>1 poin per {formatIDR(draft.earnRatePerIDR)} belanja.</Trans>}
                  control={
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm text-muted-foreground">
                        <Trans>1 poin / Rp</Trans>
                      </span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={draft.earnRatePerIDR}
                        onChange={(e) => patch({ earnRatePerIDR: toInt(e.target.value) })}
                        className="w-28"
                      />
                    </div>
                  }
                />

                <RowSep />

                <SettingRow
                  label={<Trans>Penukaran poin</Trans>}
                  description={
                    <Trans>
                      {formatCount(draft.redeemBlockPoints)} poin ={' '}
                      {formatIDR(draft.redeemBlockIDR)}.
                    </Trans>
                  }
                  control={
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={draft.redeemBlockPoints}
                        onChange={(e) => patch({ redeemBlockPoints: toInt(e.target.value) })}
                        className="w-24"
                        aria-label={t`Jumlah poin`}
                      />
                      <span className="text-sm text-muted-foreground">
                        <Trans>poin = Rp</Trans>
                      </span>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={draft.redeemBlockIDR}
                        onChange={(e) => patch({ redeemBlockIDR: toInt(e.target.value) })}
                        className="w-28"
                        aria-label={t`Nilai rupiah`}
                      />
                    </div>
                  }
                />
              </FieldGroup>

              {/* ------------------------------------------------------------ */}
              {/* Tiers                                                         */}
              {/* ------------------------------------------------------------ */}
              <div className="mt-6 border-t pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium">
                      <Trans>Tier</Trans>
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      <Trans>Pelanggan dengan belanja lebih tinggi memperoleh pengali poin.</Trans>
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addTier}>
                    <Trans>+ Tambah tier</Trans>
                  </Button>
                </div>

                {draft.tiers.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {draft.tiers.map((tier, index) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: tier rows are positional draft state with no stable id
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          value={tier.name}
                          onChange={(e) => patchTier(index, { name: e.target.value })}
                          placeholder={t`Nama tier`}
                          aria-label={t`Nama tier`}
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={tier.minSpendIDR}
                          onChange={(e) => patchTier(index, { minSpendIDR: toInt(e.target.value) })}
                          aria-label={t`Belanja minimum`}
                          className="w-32"
                        />
                        <Input
                          type="number"
                          min={1}
                          step="0.1"
                          value={tier.earnMultiplier}
                          onChange={(e) =>
                            patchTier(index, { earnMultiplier: toFloat(e.target.value) })
                          }
                          aria-label={t`Pengali poin`}
                          className="w-20"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeTier(index)}
                          aria-label={t`Hapus tier`}
                        >
                          <X />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <FieldError className="mt-4">{error}</FieldError>}
            </SettingsSection>

            <SaveBar dirty={dirty} onReset={reset} onSave={handleSave} />
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Stats                                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <Trans>Anggota</Trans>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {stats ? formatCount(stats.memberCount) : '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                <Trans>Poin beredar</Trans>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular-nums">
                {stats ? formatCount(stats.pointsOutstanding) : '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              <Trans>Pelanggan teratas</Trans>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats === undefined ? (
              <p className="text-muted-foreground text-sm">
                <Trans>Memuat…</Trans>
              </p>
            ) : stats.topCustomers.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Award />
                  </EmptyMedia>
                  <EmptyTitle>
                    <Trans>Belum ada anggota.</Trans>
                  </EmptyTitle>
                  <EmptyDescription>
                    <Trans>Pelanggan dengan poin akan muncul di sini.</Trans>
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Trans>Nama</Trans>
                    </TableHead>
                    <TableHead className="text-right">
                      <Trans>Poin</Trans>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stats.topCustomers.map((c) => (
                    <TableRow key={c._id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCount(c.pointsBalance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
