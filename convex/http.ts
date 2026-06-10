import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { auth } from './auth';
import { MockProvider } from './payments/providers/mock';
import { XenditProvider } from './payments/providers/xendit';
import { qrisWebhookSecret, resolveProvider } from './payments/providers';

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: '/webhooks/qris',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const event = await new MockProvider(qrisWebhookSecret()).verifyWebhook({ body, headers: req.headers });
    if (!event) return new Response('invalid signature', { status: 401 });

    if (event.status === 'paid') {
      const r = await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, {
        providerRef: event.providerRef,
      });
      return new Response(r, { status: 200 }); // 'settled' | 'unknown' — 200 acks either way
    }
    await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, { providerRef: event.providerRef });
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
    if (!payment) return new Response('ok', { status: 200 }); // unknown ref — ack, nothing to do
    const config = await ctx.runQuery(internal.payments.qrisDynamic.getQrisConfig, {
      cafeId: payment.cafeId,
    });
    const event = await resolveProvider(config).verifyWebhook({ body, headers: req.headers });
    if (!event) return new Response('invalid token', { status: 401 });
    if (event.status === 'paid') {
      await ctx.runMutation(internal.payments.qrisDynamic.confirmFromWebhook, {
        providerRef: event.providerRef,
      });
    } else {
      await ctx.runMutation(internal.payments.qrisDynamic.voidByRef, {
        providerRef: event.providerRef,
      });
    }
    return new Response('ok', { status: 200 });
  }),
});

export default http;
