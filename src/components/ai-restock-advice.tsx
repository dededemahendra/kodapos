import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { MessageCircle } from 'lucide-react';
import { useEffect } from 'react';
import { AiResponse } from '~/components/ai-response';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Spinner } from '~/components/ui/spinner';
import { useAiStream } from '~/hooks/use-ai-stream';
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
  // The insights/restock surfaces send no question, so the app's language
  // toggle is the only signal the model gets.
  const locale = i18n.locale === 'en' ? 'en' : 'id';
  const { text, streaming, error, send } = useAiStream();

  const connected = settings?.integrations.some((i) => i.key === 'ai' && i.connected) ?? false;

  async function generate() {
    await send({ kind: 'restock', locale });
  }

  useEffect(() => {
    if (error) toast.error(i18n._(aiErrorMessage(error)));
  }, [error, i18n]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4 text-primary" />
          <Trans>Saran Restock AI</Trans>
        </CardTitle>
        {connected ? (
          <Button type="button" size="sm" onClick={() => void generate()} disabled={streaming}>
            {streaming ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <MessageCircle data-icon="inline-start" />
            )}
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
        ) : text ? (
          <AiResponse text={text} />
        ) : streaming ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Spinner />
            <Trans>Menganalisis…</Trans>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            <Trans>Buat ringkasan AI tentang apa yang perlu dipesan dan alasannya.</Trans>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
