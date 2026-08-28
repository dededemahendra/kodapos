import { httpRouter } from 'convex/server';
import { internal } from './_generated/api';
import { httpAction } from './_generated/server';
import { handleAiStream } from './ai';
import { auth } from './auth';
import { preflightResponse } from './lib/cors';
import { handleMcpRequest } from './mcp';
import { qrisWebhookSecret, resolveProvider } from './payments/providers';
import { MockProvider } from './payments/providers/mock';
import { XenditProvider } from './payments/providers/xendit';

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: '/mcp',
  method: 'POST',
  handler: httpAction((ctx, req) => handleMcpRequest(ctx, req)),
});

// The one browser-facing route: called cross-origin from the app with a bearer
// token, so it needs CORS and a preflight (the webhook and MCP routes above are
// server-to-server and do not).
http.route({
  path: '/ai/stream',
  method: 'POST',
  handler: httpAction((ctx, req) => handleAiStream(ctx, req)),
});

http.route({
  path: '/ai/stream',
  method: 'OPTIONS',
  handler: httpAction(async (_ctx, req) => preflightResponse(req)),
});

// `/webhooks/qris` is the MOCK/dev + `simulateWebhook` route ONLY: it hardwires
// MockProvider on purpose (real Xendit traffic uses `/webhooks/qris/xendit`
// below, which resolves the per-cafe provider from config).
http.route({
  path: '/webhooks/qris',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const event = await new MockProvider(qrisWebhookSecret()).verifyWebhook({
      body,
      headers: req.headers,
    });
    if (!event) return new Response('invalid signature', { status: 401 });

    if (event.status === 'paid') {
      const r = await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, {
        providerRef: event.providerRef,
      });
      if (r === 'unknown') {
        // Not a counter order — maybe a pay-now self-order charge (public surface).
        await ctx.runMutation(internal.payments.qrisDynamic.confirmSelfOrderFromWebhook, {
          providerRef: event.providerRef,
        });
      }
      return new Response(r, { status: 200 }); // 200 acks either way
    }
    await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, {
      providerRef: event.providerRef,
    });
    await ctx.runMutation(internal.payments.qrisDynamic.voidSelfOrderCharge, {
      providerRef: event.providerRef,
    });
    return new Response('ok', { status: 200 });
  }),
});

http.route({
  path: '/webhooks/qris/xendit',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const ref = XenditProvider.parseReference(body);
    if (!ref) return new Response('bad request', { status: 400 });
    const payment = await ctx.runQuery(internal.payments.qrisDynamic.getPaymentCafeByRef, {
      providerRef: ref,
    });
    // The ref may instead belong to a pay-now self-order charge (public surface).
    const selfOrder = payment
      ? null
      : await ctx.runQuery(internal.payments.qrisDynamic.getSelfOrderCafeByRef, {
          providerRef: ref,
        });
    if (!payment && !selfOrder) return new Response('ok', { status: 200 }); // unknown ref — ack, nothing to do
    const cafeId = payment ? payment.cafeId : selfOrder!.cafeId;
    const config = await ctx.runQuery(internal.payments.qrisDynamic.getQrisConfig, { cafeId });
    // If the cafe disconnected QRIS, config is null → Mock → 401; order is reconciled/swept later (see spec follow-ups).
    const event = await resolveProvider(config).verifyWebhook({ body, headers: req.headers });
    if (!event) return new Response('invalid token', { status: 401 });
    if (payment) {
      if (event.status === 'paid') {
        await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, {
          providerRef: event.providerRef,
        });
      } else {
        await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, {
          providerRef: event.providerRef,
        });
      }
    } else if (event.status === 'paid') {
      await ctx.runMutation(internal.payments.qrisDynamic.confirmSelfOrderFromWebhook, {
        providerRef: event.providerRef,
      });
    } else {
      await ctx.runMutation(internal.payments.qrisDynamic.voidSelfOrderCharge, {
        providerRef: event.providerRef,
      });
    }
    return new Response('ok', { status: 200 });
  }),
});

export default http;
