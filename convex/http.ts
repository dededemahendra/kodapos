import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';
import { auth } from './auth';
import { resolveProvider } from './payments/providers';

const http = httpRouter();
auth.addHttpRoutes(http);

http.route({
  path: '/webhooks/qris',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const body = await req.text();
    const signature = req.headers.get('x-signature');
    const event = await resolveProvider().verifyWebhook({ body, signature });
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

export default http;
