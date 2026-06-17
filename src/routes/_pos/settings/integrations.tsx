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
import { Skeleton } from '~/components/ui/skeleton';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';
import { DEFAULT_WHATSAPP_TEMPLATE } from 'convex/lib/whatsapp';

export const Route = createFileRoute('/_pos/settings/integrations')({
  component: SettingsIntegrations,
});

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

type IntegrationCategory = 'payment' | 'delivery' | 'accounting' | 'messaging' | 'ai';

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
  // ai
  {
    key: 'ai',
    name: msg`Asisten AI`,
    description: msg`Wawasan & tanya-jawab data dengan kunci API Anda sendiri (OpenAI/Anthropic).`,
    category: 'ai',
  },
];

const CATEGORIES: IntegrationCategory[] = [
  'payment',
  'delivery',
  'accounting',
  'messaging',
  'ai',
];

function CategoryHeading({ category }: { category: IntegrationCategory }) {
  if (category === 'payment') return <Trans>Pembayaran</Trans>;
  if (category === 'delivery') return <Trans>Pesan-antar</Trans>;
  if (category === 'accounting') return <Trans>Akuntansi</Trans>;
  if (category === 'ai') return <Trans>AI</Trans>;
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
  const connectQris = useMutation(api.settings.connectQrisProvider);
  const connectWa = useMutation(api.settings.connectWhatsapp);
  const connectAiKey = useMutation(api.settings.connectAi);
  const disconnect = useMutation(api.settings.disconnectIntegration);

  const [dialogKey, setDialogKey] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [xnditKey, setXnditKey] = useState('');
  const [xnditToken, setXnditToken] = useState('');
  const [waEndpoint, setWaEndpoint] = useState('');
  const [waHeader, setWaHeader] = useState('Authorization');
  const [waToken, setWaToken] = useState('');
  const [waTemplate, setWaTemplate] = useState(DEFAULT_WHATSAPP_TEMPLATE);
  const [aiProvider, setAiProvider] = useState<'openai' | 'anthropic'>('openai');
  const [aiKey, setAiKey] = useState('');
  const [aiModel, setAiModel] = useState('gpt-4o-mini');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (s === undefined) {
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
        {[0, 1].map((g) => (
          <div key={g}>
            <Skeleton className="mb-2 mt-6 h-4 w-28" />
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="mt-3 h-3 w-full" />
                  <Skeleton className="mt-2 h-3 w-2/3" />
                  <Skeleton className="mt-4 h-8 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const connected = new Set(s.integrations.filter((i) => i.connected).map((i) => i.key));

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function openDialog(key: string) {
    setApiKey('');
    setXnditKey('');
    setXnditToken('');
    setWaToken('');
    setAiKey('');
    if (key === 'ai') {
      const ai = s?.integrations.find((i) => i.key === 'ai');
      const c = (ai?.config ?? {}) as { provider?: string; model?: string };
      const provider = c.provider === 'anthropic' ? 'anthropic' : 'openai';
      setAiProvider(provider);
      setAiModel(c.model || (provider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini'));
    }
    if (key === 'whatsapp') {
      // Prefill the non-secret fields from any saved config (token re-entered).
      const wa = s?.integrations.find((i) => i.key === 'whatsapp');
      const c = (wa?.config ?? {}) as {
        endpoint?: string;
        headerName?: string;
        bodyTemplate?: string;
      };
      setWaEndpoint(c.endpoint ?? '');
      setWaHeader(c.headerName || 'Authorization');
      setWaTemplate(c.bodyTemplate || DEFAULT_WHATSAPP_TEMPLATE);
    } else {
      setWaEndpoint('');
      setWaHeader('Authorization');
      setWaTemplate(DEFAULT_WHATSAPP_TEMPLATE);
    }
    setError(null);
    setDialogKey(key);
  }

  function closeDialog() {
    setDialogKey(null);
    setApiKey('');
    setXnditKey('');
    setXnditToken('');
    setWaToken('');
    setAiKey('');
  }

  async function handleConnect(key: string) {
    setError(null);
    setBusyKey(key);
    try {
      if (key === 'qris') {
        await connectQris({ secretApiKey: xnditKey.trim(), callbackToken: xnditToken.trim() });
      } else if (key === 'whatsapp') {
        await connectWa({
          endpoint: waEndpoint.trim(),
          headerName: waHeader.trim() || 'Authorization',
          token: waToken.trim(),
          bodyTemplate: waTemplate.trim(),
        });
      } else if (key === 'ai') {
        await connectAiKey({
          provider: aiProvider,
          apiKey: aiKey.trim(),
          model: aiModel.trim(),
        });
      } else {
        const trimmed = apiKey.trim();
        if (trimmed) {
          await connect({ key, config: { apiKey: trimmed } });
        } else {
          await connect({ key });
        }
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
                          {isBusy && <Spinner data-icon="inline-start" />}
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

          {dialogKey === 'qris' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="xnditKey" className="text-sm font-medium">
                  <Trans>Secret API Key</Trans>
                </label>
                <Input
                  id="xnditKey"
                  value={xnditKey}
                  onChange={(e) => setXnditKey(e.target.value)}
                  placeholder="xnd_..."
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="xnditToken" className="text-sm font-medium">
                  <Trans>Callback Token</Trans>
                </label>
                <Input
                  id="xnditToken"
                  value={xnditToken}
                  onChange={(e) => setXnditToken(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <Trans>Tempel kunci dari dasbor Xendit Anda. Kunci disimpan aman di server.</Trans>
              </p>
            </div>
          ) : dialogKey === 'whatsapp' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <label htmlFor="waEndpoint" className="text-sm font-medium">
                  <Trans>URL endpoint</Trans>
                </label>
                <Input
                  id="waEndpoint"
                  value={waEndpoint}
                  onChange={(e) => setWaEndpoint(e.target.value)}
                  placeholder="https://api.fonnte.com/send"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label htmlFor="waHeader" className="text-sm font-medium">
                    <Trans>Nama header otorisasi</Trans>
                  </label>
                  <Input
                    id="waHeader"
                    value={waHeader}
                    onChange={(e) => setWaHeader(e.target.value)}
                    placeholder="Authorization"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="waToken" className="text-sm font-medium">
                    <Trans>Token</Trans>
                  </label>
                  <Input
                    id="waToken"
                    value={waToken}
                    onChange={(e) => setWaToken(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="waTemplate" className="text-sm font-medium">
                  <Trans>Template body (JSON)</Trans>
                </label>
                <Textarea
                  id="waTemplate"
                  value={waTemplate}
                  onChange={(e) => setWaTemplate(e.target.value)}
                  rows={3}
                  className="font-mono text-xs"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <Trans>
                  Gunakan {'{{phone}}'} dan {'{{message}}'} sebagai placeholder. Token disimpan aman
                  di server dan tidak pernah ditampilkan kembali.
                </Trans>
              </p>
            </div>
          ) : dialogKey === 'ai' ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <span className="text-sm font-medium">
                  <Trans>Penyedia</Trans>
                </span>
                <div className="flex gap-2">
                  {(['openai', 'anthropic'] as const).map((p) => (
                    <Button
                      key={p}
                      type="button"
                      size="sm"
                      variant={aiProvider === p ? 'default' : 'outline'}
                      onClick={() => {
                        setAiProvider(p);
                        setAiModel(p === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini');
                      }}
                    >
                      {p === 'openai' ? 'OpenAI' : 'Anthropic'}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="aiKey" className="text-sm font-medium">
                  <Trans>API key</Trans>
                </label>
                <Input
                  id="aiKey"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={aiProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="aiModel" className="text-sm font-medium">
                  <Trans>Model</Trans>
                </label>
                <Input
                  id="aiModel"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder={aiProvider === 'anthropic' ? 'claude-3-5-haiku-latest' : 'gpt-4o-mini'}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                <Trans>
                  Kunci dipakai dari server Anda dan tidak pernah ditampilkan kembali. Biaya token
                  ditagih ke akun penyedia Anda.
                </Trans>
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="apiKey" className="text-sm font-medium">
                <Trans>Kunci API</Trans>
              </label>
              <Input
                id="apiKey"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={t`Masukkan kunci API (opsional)`}
                autoFocus
              />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={busyKey !== null}>
              <Trans>Batal</Trans>
            </Button>
            <Button
              disabled={busyKey !== null}
              onClick={() => dialogKey && handleConnect(dialogKey)}
            >
              {busyKey !== null && <Spinner data-icon="inline-start" />}
              <Trans>Hubungkan</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
