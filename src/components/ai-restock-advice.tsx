import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Spinner } from '~/components/ui/spinner';
import { aiErrorMessage } from '~/lib/ai-error';
import { toast } from '~/lib/toast';

/**
 * AI restock advisor card on the forecast page. Uses the owner's
 * bring-your-own-key AI integration to turn the heuristic shopping list plus the
 * demand forecast into a plain-language briefing: what to order, how much, and
 * why. Inert (with a connect prompt) until the AI integration is configured in
 * Settings.
 */
export function AiRestockAdvice() {
  const { i18n } = useLingui();
  const settings = useQuery(api.settings.get);
  const runRestock = useAction(api.ai.restock);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const connected = settings?.integrations.some((i) => i.key === 'ai' && i.connected) ?? false;

  async function generate() {
    setResult(null);
    setLoading(true);
    try {
      setResult(await runRestock({}));
    } catch (err) {
      toast.error(i18n._(aiErrorMessage(err)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          <Trans>Saran Restock AI</Trans>
        </CardTitle>
        {connected ? (
          <Button type="button" size="sm" onClick={() => void generate()} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
            <Trans>Buat saran</Trans>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {settings === undefined ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Spinner />
            <Trans>Memuat…</Trans>
          </div>
        ) : !connected ? (
          <p className="text-sm text-muted-foreground">
            <Trans>
              Hubungkan kunci API AI Anda untuk saran restock yang menjelaskan jumlah dan alasannya.
            </Trans>{' '}
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link to="/settings/integrations">
                <Trans>Buka Integrasi</Trans>
              </Link>
            </Button>
          </p>
        ) : loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Spinner />
            <Trans>Menganalisis…</Trans>
          </div>
        ) : result ? (
          <p className="whitespace-pre-line text-sm leading-relaxed">{result}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Trans>Buat ringkasan AI tentang apa yang perlu dipesan dan alasannya.</Trans>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
