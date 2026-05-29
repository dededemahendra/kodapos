import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react';
import { Trans, useLingui as useLinguiMacro } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { SettingsPageHeader } from '~/components/settings/primitives';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Input } from '~/components/ui/input';

export const Route = createFileRoute('/_pos/settings/integrations')({
  component: SettingsIntegrations,
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

type IntegrationCategory = 'payment' | 'delivery' | 'accounting' | 'messaging';

interface CatalogEntry {
  key: string;
  name: MessageDescriptor;
  description: MessageDescriptor;
  category: IntegrationCategory;
}

const CATALOG: CatalogEntry[] = [
  // payment
  {
    key: 'qris',
    name: msg`QRIS (Midtrans/Xendit)`,
    description: msg`Terima pembayaran QRIS dinamis lewat penyedia.`,
    category: 'payment',
  },
  {
    key: 'gopay',
    name: msg`GoPay`,
    description: msg`Pembayaran e-wallet GoPay.`,
    category: 'payment',
  },
  {
    key: 'ovo',
    name: msg`OVO`,
    description: msg`Pembayaran e-wallet OVO.`,
    category: 'payment',
  },
  {
    key: 'dana',
    name: msg`DANA`,
    description: msg`Pembayaran e-wallet DANA.`,
    category: 'payment',
  },
  // delivery
  {
    key: 'gofood',
    name: msg`GoFood`,
    description: msg`Terima pesanan dari GoFood.`,
    category: 'delivery',
  },
  {
    key: 'grabfood',
    name: msg`GrabFood`,
    description: msg`Terima pesanan dari GrabFood.`,
    category: 'delivery',
  },
  {
    key: 'shopeefood',
    name: msg`ShopeeFood`,
    description: msg`Terima pesanan dari ShopeeFood.`,
    category: 'delivery',
  },
  // accounting
  {
    key: 'accurate',
    name: msg`Accurate`,
    description: msg`Sinkronkan penjualan ke Accurate.`,
    category: 'accounting',
  },
  {
    key: 'mekari',
    name: msg`Mekari Jurnal`,
    description: msg`Sinkronkan penjualan ke Mekari Jurnal.`,
    category: 'accounting',
  },
  // messaging
  {
    key: 'whatsapp',
    name: msg`WhatsApp Business`,
    description: msg`Kirim struk & notifikasi via WhatsApp.`,
    category: 'messaging',
  },
];

const CATEGORIES: IntegrationCategory[] = ['payment', 'delivery', 'accounting', 'messaging'];

function CategoryHeading({ category }: { category: IntegrationCategory }) {
  if (category === 'payment') return <Trans>Pembayaran</Trans>;
  if (category === 'delivery') return <Trans>Pesan-antar</Trans>;
  if (category === 'accounting') return <Trans>Akuntansi</Trans>;
  return <Trans>Pesan</Trans>;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function SettingsIntegrations() {
  const { i18n } = useLingui();
  const { t } = useLinguiMacro();
  const s = useQuery(api.settings.get);
  const connect = useMutation(api.settings.connectIntegration);
  const disconnect = useMutation(api.settings.disconnectIntegration);

  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (s === undefined) {
    return (
      <p className="text-muted-foreground">
        <Trans>Memuat…</Trans>
      </p>
    );
  }

  const connected = new Set(s.integrations.filter((i) => i.connected).map((i) => i.key));

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function openDialog(key: string) {
    setApiKey('');
    setError(null);
    setDialogKey(key);
  }

  function closeDialog() {
    setDialogKey(null);
    setApiKey('');
  }

  async function handleConnect(key: string) {
    setError(null);
    setBusyKey(key);
    try {
      const trimmed = apiKey.trim();
      if (trimmed) {
        await connect({ key, config: { apiKey: trimmed } });
      } else {
        await connect({ key });
      }
      closeDialog();
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal menghubungkan integrasi.`);
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDisconnect(key: string) {
    setError(null);
    setBusyKey(key);
    try {
      await disconnect({ key });
    } catch (e) {
      setError(e instanceof Error ? e.message : t`Gagal memutuskan integrasi.`);
    } finally {
      setBusyKey(null);
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const dialogEntry = dialogKey ? CATALOG.find((c) => c.key === dialogKey) : null;
  const dialogEntryName = dialogEntry ? i18n._(dialogEntry.name) : null;
  const dialogTitle = dialogEntryName ? t`Hubungkan ${dialogEntryName}` : t`Hubungkan`;

  return (
    <div className="space-y-2">
      <SettingsPageHeader
        title={<Trans>Integrasi</Trans>}
        description={
          <Trans>
            Hubungkan kRestoran/POS Anda dengan layanan lain. (Penyetelan disimpan; aktivasi penuh
            menyusul.)
          </Trans>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {CATEGORIES.map((category) => {
        const entries = CATALOG.filter((c) => c.category === category);
        return (
          <div key={category}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-2 mt-6">
              <CategoryHeading category={category} />
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {entries.map((entry) => {
                const isConnected = connected.has(entry.key);
                const isBusy = busyKey === entry.key;
                const resolvedName = i18n._(entry.name);
                return (
                  <Card key={entry.key}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded bg-muted grid place-items-center font-semibold text-sm">
                            {resolvedName[0]}
                          </div>
                          <CardTitle className="text-base">{resolvedName}</CardTitle>
                        </div>
                        {isConnected ? (
                          <Badge>
                            <Trans>Terhubung</Trans>
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Trans>Belum terhubung</Trans>
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <p className="text-sm text-muted-foreground">{i18n._(entry.description)}</p>
                    </CardContent>
                    <CardFooter>
                      {isConnected ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleDisconnect(entry.key)}
                        >
                          <Trans>Putuskan</Trans>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={isBusy}
                          onClick={() => openDialog(entry.key)}
                        >
                          <Trans>Hubungkan</Trans>
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Connect dialog */}
      <Dialog open={dialogKey !== null} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              <Trans>Kunci API</Trans>
            </label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={t`Masukkan kunci API (opsional)`}
              autoFocus
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busyKey !== null}>
              <Trans>Batal</Trans>
            </Button>
            <Button
              disabled={busyKey !== null}
              onClick={() => dialogKey && handleConnect(dialogKey)}
            >
              <Trans>Hubungkan</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
