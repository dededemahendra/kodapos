import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { Send, Sparkles } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';
import { cn } from '~/lib/utils';

export const Route = createFileRoute('/_pos/ai')({
  component: AiChatPage,
});

type ChatMsg = { role: 'user' | 'assistant'; content: string };

function AiChatPage() {
  const { t } = useLingui();
  const settings = useQuery(api.settings.get);
  const chat = useAction(api.ai.chat);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const connected = settings?.integrations.some((i) => i.key === 'ai' && i.connected) ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new turns
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, loading]);

  async function send(text: string) {
    const q = text.trim();
    if (!q || loading) return;
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await chat({ messages: next });
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menjawab.`);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void send(input);
  }

  const suggestions = [
    t`Bagaimana penjualan 30 hari terakhir?`,
    t`Item apa yang paling laku?`,
    t`Bahan apa yang perlu segera diisi ulang?`,
  ];

  return (
    <main className="flex h-[calc(100svh-3.5rem)] flex-col">
      <header className="flex items-center gap-2 border-b px-6 py-3">
        <Sparkles className="size-4 text-primary" />
        <h1 className="font-semibold">
          <Trans>Asisten AI</Trans>
        </h1>
      </header>

      {!connected ? (
        <div className="flex flex-1 items-center justify-center p-6">
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Sparkles />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Hubungkan asisten AI</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>
                  Tambahkan kunci API AI Anda (OpenAI atau Anthropic) untuk bertanya tentang data
                  kafe Anda.
                </Trans>
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild size="sm">
                <Link to="/settings/integrations">
                  <Trans>Buka Integrasi</Trans>
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
              {messages.length === 0 ? (
                <div className="mt-10 text-center">
                  <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Sparkles className="size-5" />
                  </span>
                  <p className="font-medium">
                    <Trans>Tanya apa saja tentang kafe Anda</Trans>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    <Trans>Jawaban didasarkan pada data penjualan & stok 30 hari terakhir.</Trans>
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void send(s)}
                        className="rounded-full border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: chat log is append-only
                    key={i}
                    className={cn('flex gap-3', m.role === 'user' && 'justify-end')}
                  >
                    {m.role === 'assistant' ? (
                      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Sparkles className="size-4" />
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        'max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                        m.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-foreground'
                      )}
                    >
                      {m.content}
                    </div>
                  </div>
                ))
              )}
              {loading ? (
                <div className="flex gap-3">
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="flex items-center gap-2 rounded-2xl bg-muted px-3.5 py-2 text-sm text-muted-foreground">
                    <Spinner className="size-4" />
                    <Trans>Menganalisis…</Trans>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          <form onSubmit={onSubmit} className="border-t p-4">
            <div className="mx-auto flex max-w-2xl gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t`Tanya tentang penjualan, stok, pelanggan…`}
                aria-label={t`Pesan ke asisten AI`}
              />
              <Button type="submit" disabled={loading || !input.trim()} aria-label={t`Kirim`}>
                <Send className="size-4" />
              </Button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
