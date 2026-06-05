import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { Award } from 'lucide-react';
import { useState } from 'react';
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
}

/** Parse an integer input, clamping to a non-negative number (NaN → 0). */
function toInt(value: string): number {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? 0 : n;
}

function LoyaltyPage() {
  const { t } = useLingui();
  const config = useQuery(api.loyalty.getConfig);
  const stats = useQuery(api.loyalty.stats);
  const updateConfig = useMutation(api.loyalty.updateConfig);

  const { draft, setDraft, dirty, reset } = useEditableState<ConfigDraft>(config);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<ConfigDraft>) {
    if (!draft) return;
    setDraft({ ...draft, ...p });
  }

  async function handleSave() {
    if (!draft) return;
    setError(null);
    try {
      await updateConfig({
        enabled: draft.enabled,
        earnRatePerIDR: draft.earnRatePerIDR,
        redeemBlockPoints: draft.redeemBlockPoints,
        redeemBlockIDR: draft.redeemBlockIDR,
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
