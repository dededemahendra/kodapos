import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { Sparkles } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '~/components/ui/card';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

/**
 * Dashboard AI card. Uses the owner's bring-your-own-key AI integration to
 * generate a plain-language briefing of recent performance and to answer
 * questions grounded in the cafe's data. Inert (with a connect prompt) until the
 * AI integration is configured in Settings.
 */
export function AiInsights() {
  const { t } = useLingui();
  const settings = useQuery(api.settings.get);
  const runInsights = useAction(api.ai.insights);
  const runAsk = useAction(api.ai.ask);
  const [result, setResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState('');

  const connected = settings?.integrations.some((i) => i.key === 'ai' && i.connected) ?? false;

  async function generate() {
    setLoading(true);
    try {
      setResult(await runInsights({}));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal memuat wawasan.`);
    } finally {
      setLoading(false);
    }
  }

  async function onAsk(e: FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    try {
      setResult(await runAsk({ question: q }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menjawab.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          <Trans>Wawasan AI</Trans>
        </CardTitle>
        {connected ? (
          <Button type="button" size="sm" onClick={() => void generate()} disabled={loading}>
            {loading ? <Spinner data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
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
              />
              <Button type="submit" variant="outline" disabled={loading || !question.trim()}>
                <Trans>Tanya</Trans>
              </Button>
            </form>
            {loading ? (
              <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
                <Spinner />
                <Trans>Menganalisis…</Trans>
              </div>
            ) : result ? (
              <p className="whitespace-pre-line text-sm leading-relaxed">{result}</p>
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
