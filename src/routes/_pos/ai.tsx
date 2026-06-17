import { Trans, useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '~/components/ui/button';
import { ChatInput } from '~/components/ui/chat-input';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
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
  const cafe = useQuery(api.cafes.myCafe, {});
  const chat = useAction(api.ai.chat);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);

  const connected = settings?.integrations.some((i) => i.key === 'ai' && i.connected) ?? false;

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new turns
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, loading]);

  async function send(text: string) {
    const q = text.trim();
    // Single-flight via a ref (loading state lags behind rapid clicks).
    if (!q || sendingRef.current) return;
    sendingRef.current = true;
    const next: ChatMsg[] = [...messages, { role: 'user', content: q }];
    setMessages(next);
    setInput('');
    setLoading(true);
    try {
      const reply = await chat({ messages: next });
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menjawab.`);
      // Roll back the optimistic user turn so history stays valid (otherwise the
      // next send would post two consecutive user turns, which Anthropic rejects).
      setMessages(messages);
    } finally {
      setLoading(false);
      sendingRef.current = false;
    }
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 11 ? t`Selamat pagi` : hour < 15 ? t`Selamat siang` : hour < 18 ? t`Selamat sore` : t`Selamat malam`;
  const suggestions = [
    t`Bagaimana penjualan 30 hari terakhir?`,
    t`Item apa yang paling laku?`,
    t`Bahan apa yang perlu segera diisi ulang?`,
  ];

  // --- Not connected: prompt to add a key -----------------------------------
  if (!connected) {
    return (
      <main className="flex h-[calc(100svh-3.5rem)] items-center justify-center p-6">
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
      </main>
    );
  }

  // --- Empty: centered greeting + composer ----------------------------------
  if (messages.length === 0) {
    return (
      <main className="flex h-[calc(100svh-3.5rem)] flex-col overflow-y-auto p-4">
        <div className="m-auto w-full max-w-2xl">
          <div className="mb-8 text-center">
            <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="size-6" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {greeting}
              {cafe?.name ? `, ${cafe.name}` : ''}
            </h1>
            <p className="mt-1.5 text-muted-foreground">
              <Trans>Tanya apa saja tentang data kafe Anda.</Trans>
            </p>
          </div>
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => void send(input)}
            disabled={loading}
            placeholder={t`Tanya tentang penjualan, stok, pelanggan…`}
            sendLabel={t`Kirim`}
            autoFocus
          />
          <div className="mt-4 flex flex-wrap justify-center gap-2">
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
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Trans>AI bisa keliru. Periksa informasi penting.</Trans>
          </p>
        </div>
      </main>
    );
  }

  // --- Chat mode: history + pinned composer ---------------------------------
  return (
    <main className="flex h-[calc(100svh-3.5rem)] flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
          {messages.map((m, i) => (
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
          ))}
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

      <div className="border-t p-4">
        <div className="mx-auto max-w-2xl">
          <ChatInput
            value={input}
            onChange={setInput}
            onSend={() => void send(input)}
            disabled={loading}
            placeholder={t`Tanya tentang penjualan, stok, pelanggan…`}
            sendLabel={t`Kirim`}
          />
        </div>
      </div>
    </main>
  );
}
