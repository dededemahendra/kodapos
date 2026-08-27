import { useAuthToken } from '@convex-dev/auth/react';
import type { AiErrorCode, AiStreamRequest } from 'convex/lib/ai';
import { useCallback, useRef, useState } from 'react';
import { convexSiteUrl } from '~/lib/convex-site';
import { createNdjsonParser } from '~/lib/ndjson';

type StreamEvent = { t: 'delta'; v: string } | { t: 'done' } | { t: 'error'; code: AiErrorCode };

/**
 * Drives `POST /ai/stream`, appending deltas as they arrive.
 *
 * `send` resolves with the finished text (or null if it failed or was
 * stopped) so a caller that needs to commit the answer somewhere — the chat
 * page, to its history — does not have to watch `text` settle.
 */
export function useAiStream() {
  const token = useAuthToken();
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<AiErrorCode | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    // Abort only. The in-flight invocation's `finally` owns clearing `abortRef`
    // and `streaming`, and identifies itself by controller identity — nulling
    // the ref here would make that check fail and strand `streaming` at true.
    abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (req: AiStreamRequest): Promise<string | null> => {
      // Single-flight: a second send while one is in flight replaces it.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setText('');
      setError(null);
      setStreaming(true);

      let accumulated = '';
      try {
        const res = await fetch(`${convexSiteUrl()}/ai/stream`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(req),
          signal: controller.signal,
        });

        if (!res.ok || !res.body) {
          const body = (await res.json().catch(() => null)) as { code?: AiErrorCode } | null;
          setError(body?.code ?? 'provider');
          return null;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const parser = createNdjsonParser();
        let failure: AiErrorCode | null = null;
        let terminated = false;

        const handle = (events: unknown[]) => {
          for (const raw of events) {
            const event = raw as StreamEvent;
            if (event.t === 'delta') {
              accumulated += event.v;
              setText(accumulated);
            } else if (event.t === 'error') {
              failure = event.code;
              terminated = true;
            } else if (event.t === 'done') {
              terminated = true;
            }
          }
        };

        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            handle(parser.push(decoder.decode(value, { stream: true })));
            if (terminated) break;
          }
          // Flush a multi-byte character straddling the last chunk, then any
          // buffered final line that never got its newline.
          handle(parser.push(decoder.decode()));
          handle(parser.flush());
        } finally {
          await reader.cancel().catch(() => {});
        }

        if (failure) {
          setError(failure);
          return null;
        }
        if (!terminated) {
          // The body ended without `done` or `error` — a dropped connection.
          // Truncated text must never read as a finished answer.
          setError('network');
          return null;
        }
        return accumulated;
      } catch (err) {
        // A stop() abort is not a failure: keep whatever arrived, show no toast.
        if (err instanceof DOMException && err.name === 'AbortError') return null;
        setError('network');
        return null;
      } finally {
        // Only the current invocation may clear shared state — a later send()
        // has already installed its own controller and is still running.
        if (abortRef.current === controller) {
          abortRef.current = null;
          setStreaming(false);
        }
      }
    },
    [token]
  );

  return { text, streaming, error, send, stop };
}
