import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { RowActions } from '~/components/ui/row-actions';
import { Spinner } from '~/components/ui/spinner';
import { Textarea } from '~/components/ui/textarea';
import { convexSiteUrl } from '~/lib/convex-site';
import { formatDate } from '~/lib/formater';
import { toast } from '~/lib/toast';

type TokenRow = {
  _id: Id<'accessTokens'>;
  name: string;
  cafeId: Id<'cafes'>;
  createdAt: number;
  lastUsedAt: number | null;
};

async function copyToClipboard(text: string, copiedMessage: string, failMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(copiedMessage);
  } catch {
    toast.error(failMessage);
  }
}

// ---------------------------------------------------------------------------
// CreateTokenDialog — name form, then a one-time reveal of the raw token +
// a copyable MCP client config snippet. Extracted so the reveal step's local
// state (the raw token) resets cleanly whenever the dialog re-opens.
// ---------------------------------------------------------------------------

function CreateTokenDialog({
  open,
  onOpenChange,
  cafeId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cafeId: Id<'cafes'> | undefined;
}) {
  const { t } = useLingui();
  const create = useMutation(api.accessTokens.create);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<{ token: string } | null>(null);

  function handleClose(nextOpen: boolean) {
    if (!nextOpen) {
      setName('');
      setIssued(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!cafeId) return;
    setSubmitting(true);
    try {
      const result = await create({ name: name.trim(), cafeId });
      setIssued({ token: result.token });
      toast.success(t`Token dibuat.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal membuat token.`);
    } finally {
      setSubmitting(false);
    }
  }

  const configSnippet = issued
    ? JSON.stringify(
        {
          mcpServers: {
            kodapos: {
              url: `${convexSiteUrl()}/mcp`,
              headers: { Authorization: `Bearer ${issued.token}` },
            },
          },
        },
        null,
        2
      )
    : '';

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Buat token MCP</Trans>
          </DialogTitle>
        </DialogHeader>

        {issued ? (
          <div className="space-y-4">
            <p className="text-sm text-destructive">
              <Trans>
                Salin token ini sekarang. Token tidak akan ditampilkan lagi setelah dialog ini
                ditutup.
              </Trans>
            </p>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">
                <Trans>Token akses</Trans>
              </span>
              <div className="flex gap-2">
                <Input readOnly value={issued.token} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t`Salin token`}
                  onClick={() =>
                    copyToClipboard(issued.token, t`Token disalin.`, t`Gagal menyalin token.`)
                  }
                >
                  <Copy />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-sm font-medium">
                <Trans>Konfigurasi klien MCP</Trans>
              </span>
              <div className="flex gap-2">
                <Textarea readOnly value={configSnippet} rows={8} className="font-mono text-xs" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                  aria-label={t`Salin konfigurasi`}
                  onClick={() =>
                    copyToClipboard(
                      configSnippet,
                      t`Konfigurasi disalin.`,
                      t`Gagal menyalin konfigurasi.`
                    )
                  }
                >
                  <Copy />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                <Trans>Tempel potongan ini di berkas konfigurasi klien MCP Anda.</Trans>
              </p>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleClose(false)}>
                <Trans>Selesai</Trans>
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              void handleSubmit(e);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label htmlFor="mcp-token-name" className="text-sm font-medium">
                <Trans>Nama token</Trans>
              </label>
              <Input
                id="mcp-token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`mis. Claude Desktop`}
                maxLength={60}
                required
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                <Trans>Nama ini membantu Anda mengenali token saat meninjaunya nanti.</Trans>
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleClose(false)}
                disabled={submitting}
              >
                <Trans>Batal</Trans>
              </Button>
              <Button type="submit" disabled={submitting || !name.trim() || !cafeId}>
                {submitting && <Spinner data-icon="inline-start" />}
                <Trans>Buat token</Trans>
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// McpAccessCard
// ---------------------------------------------------------------------------

export function McpAccessCard() {
  const { t } = useLingui();
  const tokens = useQuery(api.accessTokens.list);
  const myCafe = useQuery(api.cafes.myCafe);
  const revoke = useMutation(api.accessTokens.revoke);

  const [createOpen, setCreateOpen] = useState(false);
  const [revokingToken, setRevokingToken] = useState<TokenRow | null>(null);

  async function runRevoke() {
    if (!revokingToken) return;
    try {
      await revoke({ id: revokingToken._id });
      toast.success(t`Token dicabut.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal mencabut token.`);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          <Trans>Hubungkan asisten AI (MCP)</Trans>
        </CardTitle>
        <CardDescription>
          <Trans>
            Akses hanya baca (read-only) ke data outlet Anda lewat Model Context Protocol (MCP).
          </Trans>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tokens === undefined ? (
          <div className="py-6">
            <Spinner />
          </div>
        ) : tokens.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRound />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Belum ada token MCP</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>
                  Buat token untuk menghubungkan asisten AI ke data outlet Anda. Aksesnya selalu
                  hanya baca.
                </Trans>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-muted-foreground bg-muted/40 border-b border-border">
                  <th className="py-2 px-3">
                    <Trans>Nama</Trans>
                  </th>
                  <th className="py-2 px-3">
                    <Trans>Dibuat</Trans>
                  </th>
                  <th className="py-2 px-3">
                    <Trans>Terakhir dipakai</Trans>
                  </th>
                  <th className="py-2 px-3 w-10" />
                </tr>
              </thead>
              <tbody>
                {tokens.map((tok) => (
                  <tr key={tok._id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 px-3 font-medium">{tok.name}</td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {formatDate(new Date(tok.createdAt).toISOString(), 'full')}
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">
                      {tok.lastUsedAt ? (
                        formatDate(new Date(tok.lastUsedAt).toISOString(), 'full')
                      ) : (
                        <Trans>Belum pernah dipakai</Trans>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <RowActions
                        label={t`Aksi baris`}
                        items={[
                          {
                            label: t`Cabut`,
                            destructive: true,
                            onSelect: () => setRevokingToken(tok),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button type="button" size="sm" onClick={() => setCreateOpen(true)} disabled={!myCafe}>
          <Trans>Buat token</Trans>
        </Button>
      </CardFooter>

      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} cafeId={myCafe?._id} />

      <ConfirmDialog
        open={!!revokingToken}
        onOpenChange={(o) => {
          if (!o) setRevokingToken(null);
        }}
        title={<Trans>Cabut token?</Trans>}
        description={
          revokingToken
            ? t`"${revokingToken.name}" tidak akan bisa lagi dipakai untuk mengakses data.`
            : undefined
        }
        confirmLabel={<Trans>Cabut</Trans>}
        destructive
        onConfirm={runRevoke}
      />
    </Card>
  );
}
