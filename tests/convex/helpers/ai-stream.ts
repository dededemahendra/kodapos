// Shared fixtures for `/ai/stream` and `ai.restock` tests. Lives in its own
// module (not inlined in a `.test.ts` file) because `ai-stream.test.ts`,
// `ai-restock.test.ts`, and Task 6's suite all need the same cafe fixture
// (`setup` / `seedSales` / `connectAi`) and the `/ai/stream` request helpers;
// Vitest only collects `tests/**/*.test.ts`, so a plain `.ts` module here is
// never picked up as a suite of its own.

import type { convexTest } from 'convex-test';
import { vi } from 'vitest';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

const TZ = 'Asia/Jakarta';
const DAY = 86_400_000;

export type Refs = {
  asOwner: ReturnType<ReturnType<typeof convexTest>['withIdentity']>;
  cafeId: Id<'cafes'>;
  cashierId: Id<'cafeStaff'>;
  shiftId: Id<'shifts'>;
  itemKopi: Id<'menuItems'>;
  ingSusu: Id<'ingredients'>;
};

/** Seeds an owner with a connected cafe (one menu item, one recipe ingredient). */
export async function setup(t: ReturnType<typeof convexTest>): Promise<Refs> {
  const userId = await t.run((ctx) => ctx.db.insert('users', { name: 'Owner', email: 'o@x.com' }));
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  await asOwner.mutation(api.cafes.updateProfile, {
    name: 'Kopi Senja',
    timezone: TZ,
    taxRatePct: 0,
    taxEnabled: false,
  });
  const cafe = await asOwner.query(api.cafes.myCafe, {});
  const cafeId = cafe!._id as Id<'cafes'>;
  const cashierId = await asOwner.mutation(api.staff.create, { name: 'Andi', pin: '1234' });
  const shiftId = await asOwner.mutation(api.shifts.open, { cashierId, openingFloatIDR: 100000 });
  const categoryId = await asOwner.mutation(api.menu.categories.create, { name: 'Minuman' });
  const itemKopi = await asOwner.mutation(api.menu.items.create, {
    categoryId,
    name: 'Kopi',
    priceIDR: 15000,
  });
  const ingSusu = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Susu',
    canonicalUnit: 'ml',
    reorderThreshold: 0,
    lastCostPerUnitIDR: 100,
  });
  await asOwner.mutation(api.recipes.upsert, {
    menuItemId: itemKopi,
    lines: [{ ingredientId: ingSusu, qty: 50, wastageFactor: 1 }],
  });
  return { asOwner, cafeId, cashierId, shiftId, itemKopi, ingSusu };
}

/** Backdates `days` paid orders of one Kopi each, giving restock/forecast
 * queries enough history to leave the "learning" state. */
export async function seedSales(
  t: ReturnType<typeof convexTest>,
  refs: Refs,
  days: number,
  nowMs: number
) {
  for (let d = 1; d <= days; d++) {
    const at = nowMs - d * DAY;
    await t.run((ctx) =>
      ctx.db.insert('orders', {
        cafeId: refs.cafeId,
        shiftId: refs.shiftId,
        cashierId: refs.cashierId,
        clientId: `c-${d}`,
        lines: [
          {
            menuItemId: refs.itemKopi,
            nameSnapshot: 'Kopi',
            qty: 10,
            unitPriceIDR: 15000,
            modifiersSnapshot: [],
            lineTotalIDR: 150000,
          },
        ],
        subtotalIDR: 150000,
        taxRatePct: 0,
        taxIDR: 0,
        discountIDR: 0,
        totalIDR: 150000,
        paymentMethod: 'cash',
        paymentStatus: 'paid',
        createdAtClient: at,
        syncedAt: at,
      })
    );
  }
}

/** Connects the AI integration with a test API key for the given provider. */
export async function connectAi(
  refs: Refs,
  provider: 'openai' | 'anthropic' = 'openai',
  model = 'gpt-4o-mini'
) {
  await refs.asOwner.mutation(api.settings.connectAi, {
    provider,
    apiKey: provider === 'anthropic' ? 'sk-ant-test-key' : 'sk-test-key',
    model,
  });
}

/** Reads an NDJSON response body into the list of events it carried. */
export async function readEvents(res: Response): Promise<Array<Record<string, unknown>>> {
  const text = await res.text();
  return text
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

/** Mocks the provider with an SSE body, capturing the outgoing request. */
export function mockStreamingProvider(sse: string) {
  const captured: { url: string; body: string } = { url: '', body: '' };
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    captured.url = String(url);
    captured.body = String(init?.body ?? '');
    return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  return { spy, captured };
}

export const OPENAI_SSE =
  'data: {"choices":[{"delta":{"content":"Beli 5000 ml "}}]}\n' +
  'data: {"choices":[{"delta":{"content":"Susu."}}]}\n' +
  'data: [DONE]\n';

export function post(
  who: { fetch: (path: string, init?: RequestInit) => Promise<Response> },
  body: unknown
) {
  return who.fetch('/ai/stream', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify(body),
  });
}
