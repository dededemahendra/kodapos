import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { useLocale } from '~/components/locale-provider';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Separator } from '~/components/ui/separator';
import { type Locale, LOCALES } from '~/lib/locale';
import { applyDensity, getDensity, storeDensity, type Density } from '~/lib/preferences';

export const Route = createFileRoute('/_pos/settings/general')({
  component: GeneralSettings,
});

function GeneralSettings() {
  const { locale, setLocale } = useLocale();
  const [density, setDensity] = useState<Density>(() => getDensity());
  const cafe = useQuery(api.cafes.myCafe, {});

  function handleDensityChange(value: string) {
    const d = value as Density;
    setDensity(d);
    storeDensity(d);
    applyDensity(d);
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">
          <Trans>Umum</Trans>
        </h1>
        <p className="text-muted-foreground text-sm">
          <Trans>Preferensi tampilan dan regional aplikasi.</Trans>
        </p>
      </div>

      {/* Bahasa */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Bahasa</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>Bahasa tampilan aplikasi.</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Select onValueChange={(v) => setLocale(v as Locale)} value={locale}>
            <SelectTrigger className="w-full max-w-xs">
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
        </CardContent>
      </Card>

      {/* Tampilan */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Tampilan</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>Atur kerapatan elemen antarmuka.</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              <Trans>Kepadatan tampilan</Trans>
            </p>
            <Select onValueChange={handleDensityChange} value={density}>
              <SelectTrigger className="w-full max-w-xs">
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
          </div>
        </CardContent>
      </Card>

      {/* Regional */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            <Trans>Regional</Trans>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mata Uang */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                <Trans>Mata Uang</Trans>
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                <Trans>Semua transaksi dalam Rupiah.</Trans>
              </p>
            </div>
            <span className="text-sm font-mono text-muted-foreground shrink-0">
              Rupiah (Rp)
            </span>
          </div>

          <Separator />

          {/* Zona Waktu */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                <Trans>Zona Waktu</Trans>
              </p>
              <p className="text-sm text-muted-foreground mt-0.5">
                <Trans>Ubah di Profil kafe.</Trans>
              </p>
            </div>
            <span className="text-sm font-mono text-muted-foreground shrink-0">
              {cafe?.timezone ?? 'Asia/Jakarta'}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
