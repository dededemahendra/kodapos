import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { MessageCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { AiResponse } from '~/components/ai-response';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { useAiStream } from '~/hooks/use-ai-stream';

/**
 * Dashboard AI card. Uses the owner's bring-your-own-key AI integration to
 * generate a plain-language briefing of recent performance and to answer
 * questions grounded in the cafe's data. Inert (with a connect prompt) until the
 * AI integration is configured in Settings.
 */
export function AiInsights() {
  const { t, i18n } = useLingui();
  const settings = useQuery(api.settings.get);
  // The insights/restock surfaces send no question, so the app's language
  // toggle is the only signal the model gets.
  const locale = i18n.locale === 'en' ? 'en' : 'id';
  const { text, streaming, send } = useAiStream();
  const [question, setQuestion] = useState('');

  const connected = settings?.integrations.some((i) => i.key === 'ai' && i.connected) ?? false;

  async function generate() {
    await send({ kind: 'insights', locale });
  }

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || streaming) return;
    // The ask box is a one-message chat: same prompt, and multi-turn later if
    // we want it.
    await send({ kind: 'chat', locale, messages: [{ role: 'user', content: q }] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageCircle className="size-4 text-primary" />
          <Trans>Wawasan AI</Trans>
        </CardTitle>
        {connected ? (
          <Button type="button" size="sm" onClick={() => void generate()} disabled={streaming}>
            {streaming ? (
              <Spinner data-icon="inline-start" />
            ) : (
              <MessageCircle data-icon="inline-start" />
            )}
            <Trans>Buat wawasan</Trans>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {!connected ? (
          <p className="text-sm text-muted-foreground">
            <Trans>
              Hubungkan kunci API AI Anda untuk wawasan dan tanya-jawab data penjualan &amp; stok.
            </Trans>{' '}
            <Button asChild variant="link" size="sm" className="h-auto px-0">
              <Link to="/settings/integrations">
                <Trans>Buka Integrasi</Trans>
              </Link>
            </Button>
          </p>
        ) : (
          <div className="space-y-3">
            <form onSubmit={onAsk} className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={t`Tanya tentang data Anda, mis. hari terbaik bulan ini`}
                aria-label={t`Tanya AI`}
                maxLength={2000}
              />
              <Button type="submit" variant="outline" disabled={streaming || !question.trim()}>
                <Trans>Tanya</Trans>
              </Button>
            </form>
            {text ? (
              <AiResponse text={text} />
            ) : streaming ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Spinner />
                <Trans>Menganalisis…</Trans>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                <Trans>Buat wawasan atau ajukan pertanyaan tentang penjualan dan stok Anda.</Trans>
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
