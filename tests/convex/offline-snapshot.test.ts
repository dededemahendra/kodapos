import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

// The literal secrets connected below. Every one of them is a value that, if it
// reached a till, would let whoever holds that tablet charge money against the
// cafe's provider account.
const XENDIT_SECRET = 'xnd_production_super_secret_key';
const XENDIT_CALLBACK = 'callback-token-do-not-leak';
const WHATSAPP_TOKEN = 'wa-bearer-token-do-not-leak';
const AI_KEY = 'sk-ai-key-do-not-leak';

type Setup = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
};

/**
 * A cafe with every integration connected, a PIN'd cashier on an hourly rate,
 * and an open shift — i.e. the exact state in which `registerSnapshot` returns
 * a payload rather than null.
 */
async function setup(t: ReturnType<typeof convexTest>): Promise<Setup> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: 'Asia/Jakarta',
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  await asOwner.mutation(api.staff.setHourlyRate, { id: cashierId, hourlyRateIDR: 25000 });
  await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Kopi' });
  await asOwner.mutation(api.menu.items.create, { categoryId, name: 'Kopi', priceIDR: 20000 });

  // Owner-only mutations — which is the point. The credentials they store are
  // written by an owner and must never come back out through a query the whole
  // floor can call.
  await asOwner.mutation(api.settings.connectQrisProvider, {
    secretApiKey: XENDIT_SECRET,
    callbackToken: XENDIT_CALLBACK,
  });
  await asOwner.mutation(api.settings.connectWhatsapp, {
    endpoint: 'https://wa.example.com/send',
    token: WHATSAPP_TOKEN,
    bodyTemplate: '{"target":"{{phone}}","message":"{{message}}"}',
  });
  await asOwner.mutation(api.settings.connectAi, {
    provider: 'openai',
    apiKey: AI_KEY,
    model: 'gpt-4o-mini',
  });

  // A fresh cafe has no stored payment/receipt groups (settings.get merges
  // defaults on read), so persist the defaults — the snapshot reads the stored
  // row, and the test below checks those groups survive the projection.
  const defaults = await asOwner.query(api.settings.get, {});
  await asOwner.mutation(api.settings.updatePayment, { payment: defaults.payment });
  await asOwner.mutation(api.settings.updateReceipt, { receipt: defaults.receipt });

  return { asOwner, cafeId, cashierId };
}

describe('offline.registerSnapshot', () => {
  it('never ships payment-provider credentials to the till', async () => {
    // The regression this exists for. `registerSnapshot` used to return the RAW
    // cafeSettings document, whose `integrations[].config` holds the live
    // Xendit secret key + callback token, the WhatsApp token, and the AI
    // provider key. The query is gated only by `requireActiveOutlet`, and
    // `sale-screen.tsx` writes its result into IndexedDB on load and every 15
    // minutes — so a production payment credential ended up sitting
    // unencrypted on every tablet in the cafe, readable from devtools by
    // anyone who could open the register.
    const t = convexTest(schema, modules);
    const s = await setup(t);

    const snapshot = await s.asOwner.query(api.offline.registerSnapshot, {});
    expect(snapshot).not.toBeNull();

    // Serialized, not field-by-field: the assertion has to hold no matter
    // where in the payload a secret might hide.
    const serialized = JSON.stringify(snapshot);
    for (const secret of [XENDIT_SECRET, XENDIT_CALLBACK, WHATSAPP_TOKEN, AI_KEY]) {
      expect(serialized).not.toContain(secret);
    }
    // The credentials live under `integrations`, which the register has no use
    // for at all — so the whole group stays server-side rather than shipping a
    // redacted copy nobody reads.
    expect(serialized).not.toContain('integrations');
    expect(snapshot!.settings).not.toHaveProperty('integrations');

    // The settings the register actually needs are still there, or the fix
    // would have "secured" the feature by breaking it.
    expect(snapshot!.settings.payment?.methods.cash).toBe(true);
    expect(snapshot!.settings.receipt?.paperSize).toBe('80mm');
  });

  it('never ships the owner notification email to the till', async () => {
    // Same document, same reasoning: `notifications.summaryEmail` is the
    // owner's address, and it has no role in ringing a sale.
    const t = convexTest(schema, modules);
    const s = await setup(t);
    await s.asOwner.mutation(api.settings.updateNotifications, {
      notifications: { summaryEmail: 'owner@example.com', emailSummaryOnClose: true },
    });

    const snapshot = await s.asOwner.query(api.offline.registerSnapshot, {});
    expect(JSON.stringify(snapshot)).not.toContain('owner@example.com');
  });

  it('never writes staff PIN hashes or wages to device storage', async () => {
    // `staff.list` already exposes these to a signed-in operator, so this is
    // not a new read path — but the snapshot is PERSISTED to the tablet, and a
    // PIN hash or a wage bill surviving on a device that walks out of the cafe
    // is a different exposure from one that lives in a page's memory.
    const t = convexTest(schema, modules);
    const s = await setup(t);

    const snapshot = await s.asOwner.query(api.offline.registerSnapshot, {});
    const cashier = snapshot!.staff.find((row) => row._id === s.cashierId);
    expect(cashier).toBeDefined();
    // Still enough to print "Kasir: Andi" on the receipt.
    expect(cashier!.name).toBe('Andi');
    expect(cashier).not.toHaveProperty('pinHash');
    expect(cashier).not.toHaveProperty('hourlyRateIDR');
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toContain('pinHash');
    expect(serialized).not.toContain('hourlyRateIDR');
  });
});

describe('settings.get', () => {
  it('still redacts every connected integration', async () => {
    // `settings.get` and `offline.registerSnapshot` now share one redaction
    // module, so this pins the behavior the shared helper has to keep.
    const t = convexTest(schema, modules);
    const s = await setup(t);

    const settings = await s.asOwner.query(api.settings.get, {});
    const serialized = JSON.stringify(settings);
    for (const secret of [XENDIT_SECRET, XENDIT_CALLBACK, WHATSAPP_TOKEN, AI_KEY]) {
      expect(serialized).not.toContain(secret);
    }
    // The masked hints the settings screen renders survive.
    const qris = settings.integrations.find((i) => i.key === 'qris');
    expect((qris?.config as { keyHint?: string }).keyHint).toContain('…');
  });
});
