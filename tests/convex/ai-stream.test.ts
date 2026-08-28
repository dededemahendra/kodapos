import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import schema from '../../convex/schema';
import {
  connectAi,
  mockStreamingProvider,
  OPENAI_SSE,
  post,
  readEvents,
  seedSales,
  setup,
} from './helpers/ai-stream';

const modules = import.meta.glob('../../convex/**/*.*s');

describe('POST /ai/stream', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rejects an unauthenticated caller with 401', async () => {
    const t = convexTest(schema, modules);
    const res = await post(t, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: 'unauthorized' });
  });

  it('returns 400 not_configured when no AI key is connected', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'not_configured' });
  });

  it('returns 400 bad_request for an unknown kind', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    const res = await post(refs.asOwner, { kind: 'summarise' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ code: 'bad_request' });
  });

  it('streams deltas then done, and sends stream:true to the provider', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'openai', 'gpt-4o-mini');
    await seedSales(t, refs, 20, Date.now());
    const { captured } = mockStreamingProvider(OPENAI_SSE);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(200);
    expect(JSON.parse(captured.body).stream).toBe(true);
    expect(await readEvents(res)).toEqual([
      { t: 'delta', v: 'Beli 5000 ml ' },
      { t: 'delta', v: 'Susu.' },
      { t: 'done' },
    ]);
  });

  it('echoes an allowed origin in the CORS header', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider(OPENAI_SSE);
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
  });

  it('answers the CORS preflight', async () => {
    const t = convexTest(schema, modules);
    const res = await t.fetch('/ai/stream', {
      method: 'OPTIONS',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  // 424, not the semantically obvious 502: Cloudflare intercepts and replaces
  // 502/504 response bodies on *.convex.site, so the route answers with 424
  // instead — see the comment at `fail(424, 'provider')` in convex/ai.ts.
  it('returns 424 provider when the provider rejects the request', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 401 }));
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(424);
    expect(await res.json()).toEqual({ code: 'provider' });
  });

  it('emits an in-band empty error when the stream produces no text', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider('data: [DONE]\n');
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(200);
    expect(await readEvents(res)).toEqual([{ t: 'error', code: 'empty' }]);
  });

  it('emits a delta then a bare provider code for a mid-stream error, never the raw message', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    // OpenAI-shaped: a good delta, then an in-band error carrying account/quota
    // detail that must never reach the client.
    mockStreamingProvider(
      'data: {"choices":[{"delta":{"content":"Beli 5000 ml "}}]}\n' +
        'data: {"error":{"message":"insufficient_quota: account acct_12345 suspended"}}\n'
    );
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(200);
    const raw = await res.clone().text();
    expect(raw).not.toContain('insufficient_quota');
    expect(raw).not.toContain('acct_12345');
    expect(await readEvents(res)).toEqual([
      { t: 'delta', v: 'Beli 5000 ml ' },
      { t: 'error', code: 'provider' },
    ]);
  });

  it('cancelling the response stream does not throw, and aborts the upstream fetch', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());

    // A controlled upstream body: the first chunk is available immediately,
    // but the stream is held open until the test releases it. That opens a
    // window — matching a real network stream — where the client cancels
    // while `start()`'s loop is still mid-generation: the exact race Task
    // 10's "stop generating" button hits on every use.
    let finishUpstream!: () => void;
    const held = new Promise<void>((resolve) => {
      finishUpstream = resolve;
    });
    const captured: { signal: AbortSignal | undefined } = { signal: undefined };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
      captured.signal = init?.signal as AbortSignal | undefined;
      const encoder = new TextEncoder();
      const upstreamBody = new ReadableStream<Uint8Array>({
        async start(c) {
          c.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Halo"}}]}\n'));
          await held;
          c.enqueue(encoder.encode('data: [DONE]\n'));
          c.close();
        },
      });
      return new Response(upstreamBody, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    });

    // Cancelling settles the stream to "closed" before our `cancel()` callback
    // even runs, and once `start()`'s background loop later reaches `finally`,
    // calling `enqueue`/`close` on that already-closed controller throws
    // `TypeError: Invalid state: Controller is already closed` deep inside the
    // stream engine. Nothing above observes that throw (the engine treats a
    // startAlgorithm rejection as a no-op once the stream is no longer
    // "readable", so it never becomes an unhandled rejection or a rejected
    // `await`) — so this spy is the only way to detect it.
    const enqueueSpy = vi.spyOn(ReadableStreamDefaultController.prototype, 'enqueue');
    const closeSpy = vi.spyOn(ReadableStreamDefaultController.prototype, 'close');

    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    if (!res.body) throw new Error('expected a streamed body');
    const reader = res.body.getReader();
    await reader.read(); // the first NDJSON delta line — generation is now mid-flight
    await expect(reader.cancel()).resolves.toBeUndefined();
    expect(captured.signal?.aborted).toBe(true);

    // Let the upstream finish so `start()`'s loop reaches its `finally` block —
    // pre-fix, this is exactly where the already-closed controller throws.
    finishUpstream();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const threw = [...enqueueSpy.mock.results, ...closeSpy.mock.results].some(
      (r) => r.type === 'throw'
    );
    expect(threw).toBe(false);
  });

  it('returns 429 once the per-cafe window is exhausted', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider(OPENAI_SSE);
    // 40 calls per 10-minute window; the 41st must be refused.
    for (let i = 0; i < 40; i++) {
      const ok = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
      expect(ok.status).toBe(200);
      await ok.text();
    }
    const res = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ code: 'rate_limited' });
  });

  it('does not consume rate-limit budget when the AI key is not connected', async () => {
    // config must be checked BEFORE the limiter, or an unconfigured owner could
    // exhaust their own window without a single provider call.
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    for (let i = 0; i < 5; i++) {
      expect((await post(refs.asOwner, { kind: 'insights', locale: 'id' })).status).toBe(400);
    }
    await connectAi(refs);
    await seedSales(t, refs, 20, Date.now());
    mockStreamingProvider(OPENAI_SSE);
    // The full window must still be available.
    for (let i = 0; i < 40; i++) {
      const ok = await post(refs.asOwner, { kind: 'insights', locale: 'id' });
      expect(ok.status).toBe(200);
      await ok.text();
    }
  });

  it('rate-limits before gathering, so a learning-forecast restock still costs budget', async () => {
    // The limiter must run BEFORE gatherRestock: that gather runs computeDemand
    // twice over the trailing order window. If gathering came first, this call
    // would return the 200 "still learning" message instead of 429.
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs);
    await seedSales(t, refs, 5, Date.now()); // too little history — forecast is 'learning'
    for (let i = 0; i < 40; i++) {
      await (await post(refs.asOwner, { kind: 'restock', locale: 'id' })).text();
    }
    const res = await post(refs.asOwner, { kind: 'restock', locale: 'id' });
    expect(res.status).toBe(429);
  });

  it('sends chat history with the cafe data in the system prompt', async () => {
    const t = convexTest(schema, modules);
    const refs = await setup(t);
    await connectAi(refs, 'anthropic', 'claude-3-5-haiku-20241022');
    await seedSales(t, refs, 20, Date.now());
    const { captured } = mockStreamingProvider(
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Halo"}}\n' +
        'data: {"type":"message_stop"}\n'
    );
    const res = await post(refs.asOwner, {
      kind: 'chat',
      locale: 'id',
      messages: [{ role: 'user', content: 'Berapa penjualan?' }],
    });
    const body = JSON.parse(captured.body);
    expect(body.system).toContain('Cafe data (JSON)');
    expect(body.messages).toEqual([{ role: 'user', content: 'Berapa penjualan?' }]);
    expect(await readEvents(res)).toEqual([{ t: 'delta', v: 'Halo' }, { t: 'done' }]);
  });
});
