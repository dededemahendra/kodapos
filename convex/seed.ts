import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { internalMutation } from './_generated/server';
import type { MutationCtx } from './_generated/server';

// ─────────────────────────────────────────────────────────────────────────────
// Dev demo seed. Populates an existing cafe with a large, internally-consistent
// set of example data so the dashboard, reports, inventory, customers, etc. all
// look rich. Invoke with:  npx convex run seed:run
//
// Correctness anchors (read before editing):
//  - convex/schema.ts            — every table shape inserted here.
//  - convex/lib/sale.ts          — the orders + payments insert shape this mirrors.
//  - convex/lib/pricing.ts       — computeOrderTotals (subtotal → SC → tax → total).
//  - convex/reports.ts           — reads orders.paymentBreakdown (via methodTotals),
//                                  lines[].recipeSnapshot + ingredient cost for COGS.
//  - convex/dashboard.ts         — reads paid orders by createdAtClient, refunds, stock.
//
// All randomness flows through a seeded LCG (no Math.random) so re-runs with the
// same seed are deterministic. Date.now() is "now" for date math.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

// ─── Seeded PRNG (LCG, glibc constants) ──────────────────────────────────────
function makeRng(seed: number) {
  let state = (seed >>> 0) || 1;
  const next = () => {
    // Numerical Recipes LCG; take high bits for a 0..1 float.
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
  return {
    /** float in [0,1) */
    f: next,
    /** int in [min,max] inclusive */
    i: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    /** pick one element */
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    /** true with probability p */
    chance: (p: number) => next() < p,
    /** money rounded to nearest `step` rupiah within [min,max] */
    money: (min: number, max: number, step = 500) => {
      const raw = min + Math.floor(next() * (max - min + 1));
      return Math.round(raw / step) * step;
    },
    /** shuffle a copy */
    shuffle: <T>(arr: readonly T[]): T[] => {
      const a = [...arr];
      for (let k = a.length - 1; k > 0; k--) {
        const j = Math.floor(next() * (k + 1));
        const tmp = a[k]!;
        a[k] = a[j]!;
        a[j] = tmp;
      }
      return a;
    },
  };
}

type Rng = ReturnType<typeof makeRng>;

// ─── Static demo content ─────────────────────────────────────────────────────
const CATEGORY_NAMES = [
  'Kopi',
  'Non-Kopi',
  'Teh',
  'Pastry',
  'Makanan',
  'Camilan',
  'Dessert',
  'Botolan',
] as const;

// [name, category index, base price] — prices in realistic IDR ranges.
const MENU: ReadonlyArray<readonly [string, number, number]> = [
  ['Es Kopi Susu', 0, 22000],
  ['Americano', 0, 20000],
  ['Cappuccino', 0, 28000],
  ['Caffe Latte', 0, 30000],
  ['Espresso', 0, 18000],
  ['Cortado', 0, 26000],
  ['Mocha', 0, 32000],
  ['Kopi Tubruk', 0, 15000],
  ['Vietnam Drip', 0, 24000],
  ['Affogato', 0, 35000],
  ['Cokelat Panas', 1, 25000],
  ['Es Cokelat', 1, 27000],
  ['Matcha Latte', 1, 33000],
  ['Es Matcha', 1, 35000],
  ['Red Velvet Latte', 1, 34000],
  ['Taro Latte', 1, 32000],
  ['Teh Tarik', 2, 18000],
  ['Es Teh Manis', 2, 8000],
  ['Lemon Tea', 2, 16000],
  ['Earl Grey', 2, 20000],
  ['Chamomile', 2, 22000],
  ['Croissant', 3, 24000],
  ['Pain au Chocolat', 3, 27000],
  ['Almond Croissant', 3, 30000],
  ['Cinnamon Roll', 3, 26000],
  ['Danish Keju', 3, 25000],
  ['Nasi Goreng Spesial', 4, 42000],
  ['Mie Goreng', 4, 38000],
  ['Chicken Katsu Rice', 4, 48000],
  ['Beef Rice Bowl', 4, 52000],
  ['Spaghetti Aglio Olio', 4, 45000],
  ['Sandwich Tuna', 4, 36000],
  ['Club Sandwich', 4, 44000],
  ['Kentang Goreng', 5, 22000],
  ['Onion Rings', 5, 24000],
  ['Chicken Wings', 5, 38000],
  ['Pisang Goreng', 5, 18000],
  ['Tahu Crispy', 5, 16000],
  ['Tiramisu', 6, 35000],
  ['Cheesecake', 6, 38000],
  ['Brownies', 6, 28000],
  ['Pudding Cokelat', 6, 22000],
  ['Es Krim Vanilla', 6, 20000],
  ['Air Mineral', 7, 8000],
  ['Soda Botol', 7, 15000],
] as const;

const INGREDIENTS: ReadonlyArray<readonly [string, 'g' | 'ml' | 'piece', number, number]> = [
  // [name, unit, reorderThreshold, lastCostPerUnitIDR]
  ['Biji Kopi Arabika', 'g', 2000, 350],
  ['Biji Kopi Robusta', 'g', 2000, 220],
  ['Susu Full Cream', 'ml', 5000, 18],
  ['Susu UHT', 'ml', 5000, 15],
  ['Gula Pasir', 'g', 3000, 14],
  ['Gula Aren', 'ml', 2000, 40],
  ['Bubuk Cokelat', 'g', 1000, 120],
  ['Bubuk Matcha', 'g', 500, 600],
  ['Sirup Vanilla', 'ml', 1000, 80],
  ['Sirup Karamel', 'ml', 1000, 85],
  ['Teh Hitam', 'g', 800, 90],
  ['Es Batu', 'g', 10000, 2],
  ['Tepung Terigu', 'g', 5000, 12],
  ['Mentega', 'g', 2000, 95],
  ['Telur', 'piece', 100, 2500],
  ['Keju Cheddar', 'g', 1500, 130],
  ['Ayam Fillet', 'g', 4000, 55],
  ['Daging Sapi', 'g', 3000, 120],
  ['Beras', 'g', 10000, 14],
  ['Mie Telur', 'g', 3000, 28],
  ['Kentang', 'g', 5000, 18],
  ['Pisang', 'piece', 80, 2000],
  ['Cokelat Batang', 'g', 1500, 150],
  ['Krim Kocok', 'ml', 1500, 60],
  ['Roti Tawar', 'piece', 60, 1500],
] as const;

const SUPPLIERS: ReadonlyArray<readonly [string, string]> = [
  ['CV Kopi Nusantara', '081234567001'],
  ['PT Susu Segar Jaya', '081234567002'],
  ['Toko Bahan Kue Makmur', '081234567003'],
  ['UD Sayur & Daging Pasar Pagi', '081234567004'],
  ['Distributor Minuman Sejahtera', '081234567005'],
  ['Gudang Kemasan & Gula', '081234567006'],
] as const;

const FIRST_NAMES = [
  'Adi', 'Budi', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Indah', 'Joko',
  'Kartika', 'Lina', 'Mira', 'Nanda', 'Oka', 'Putri', 'Rizki', 'Sari', 'Tono', 'Umar',
  'Vina', 'Wahyu', 'Yanti', 'Zaki', 'Bayu', 'Cinta', 'Dian', 'Erik', 'Fitri', 'Gilang',
] as const;
const LAST_NAMES = [
  'Santoso', 'Wijaya', 'Pratama', 'Lestari', 'Halim', 'Nugroho', 'Putra', 'Saputra',
  'Anggraini', 'Kusuma', 'Hidayat', 'Permata', 'Wibowo', 'Maharani', 'Suryadi', 'Gunawan',
] as const;

const STAFF_NAMES = [
  'Rina (Kasir)',
  'Doni (Kasir)',
  'Sinta (Kasir)',
  'Bagus (Kasir)',
  'Yoga (Kasir)',
  'Maya (Manajer)',
  'Reza (Manajer)',
  'Tari (Kasir)',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** A timestamp on day `daysAgo` ago, at a random business hour. */
function dateInRange(rng: Rng, now: number, daysAgo: number): number {
  const dayStart = now - daysAgo * DAY_MS;
  // Bias toward 08:00–21:00 trading hours.
  const hour = rng.i(8, 21);
  const min = rng.i(0, 59);
  const d = new Date(dayStart);
  d.setHours(hour, min, rng.i(0, 59), 0);
  return d.getTime();
}

function dateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function timeStr(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function genCode(rng: Rng, prefix: string, len: number): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = prefix;
  for (let i = 0; i < len; i++) out += alphabet[rng.i(0, alphabet.length - 1)]!;
  return out;
}

// Tables we own + purge between (everything except `cafes` itself and auth/users).
const SEED_TABLES = [
  'categories', 'menuItems', 'modifierGroups', 'modifierOptions', 'menuItemModifierGroups',
  'menuItemVariants', 'cafeStaff', 'scheduledShifts', 'shifts', 'cashMovements', 'timeClock',
  'tables', 'orders', 'payments', 'ingredients', 'recipes', 'promotions', 'suppliers',
  'customers', 'reservations', 'loyaltyRewards', 'loyaltyTransactions', 'giftCards',
  'giftCardTransactions', 'purchases', 'purchaseOrders', 'forecasts', 'restockSuggestions',
  'expenses', 'otherIncome', 'inventoryMovements',
] as const;

async function purgeForCafe(ctx: MutationCtx, cafeId: Id<'cafes'>): Promise<void> {
  for (const table of SEED_TABLES) {
    // Each seeded table carries cafeId; not all have a by-cafe index, so we filter.
    const rows = await ctx.db
      .query(table)
      .filter((q) => q.eq(q.field('cafeId'), cafeId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

export const run = internalMutation({
  args: {
    cafeId: v.optional(v.id('cafes')),
    days: v.optional(v.number()),
    seed: v.optional(v.number()),
    purge: v.optional(v.boolean()),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const rng = makeRng(args.seed ?? 12345);
    const days = args.days ?? 60;
    const now = Date.now();

    // ── Resolve target cafe (never mutate the cafe row itself) ────────────────
    const cafe = args.cafeId ? await ctx.db.get(args.cafeId) : await ctx.db.query('cafes').first();
    if (!cafe) {
      throw new Error(
        'No cafe found to seed. Create a cafe first (or pass cafeId). Seed never creates cafes.'
      );
    }
    const cafeId = cafe._id;

    if (args.purge === true) await purgeForCafe(ctx, cafeId);

    // Cafe tax config drives order math (mirrors buildOrder).
    const taxEnabled = cafe.taxEnabled === true;
    const taxRatePct = taxEnabled ? cafe.taxRatePct ?? 0 : 0;

    // ── cafeSettings (loyalty + payment) ──────────────────────────────────────
    // Ensure a settings row exists with loyalty enabled + tiers so loyalty
    // earn/redeem math and the customer tiers are coherent. Service charge OFF
    // by default to keep order arithmetic simple (a minority still varies via
    // discount). We DON'T flip a static-QRIS image requirement; orders are
    // inserted directly here, not through buildOrder's gates.
    const SC_ENABLED = false;
    const SC_PCT = 0;
    const SC_NAME = 'Biaya Layanan';
    const loyaltyCfg = {
      enabled: true,
      earnRatePerIDR: 1000,
      redeemBlockPoints: 100,
      redeemBlockIDR: 10000,
      tiers: [
        { name: 'Bronze', minSpendIDR: 0, earnMultiplier: 1 },
        { name: 'Silver', minSpendIDR: 500000, earnMultiplier: 1.25 },
        { name: 'Gold', minSpendIDR: 2000000, earnMultiplier: 1.5 },
      ],
    };
    const existingSettings = await ctx.db
      .query('cafeSettings')
      .withIndex('by_cafe', (q) => q.eq('cafeId', cafeId))
      .first();
    if (existingSettings) {
      await ctx.db.patch(existingSettings._id, { loyalty: loyaltyCfg, updatedAt: now });
    }
    // (We intentionally do NOT insert a fresh cafeSettings row if absent — the
    // app owns its creation/shape; loyalty defaults still make the data coherent.)

    const counts: Record<string, number> = {};
    const bump = (k: string, n = 1) => {
      counts[k] = (counts[k] ?? 0) + n;
    };

    // ── Categories ────────────────────────────────────────────────────────────
    const categoryIds: Id<'categories'>[] = [];
    for (let i = 0; i < CATEGORY_NAMES.length; i++) {
      const id = await ctx.db.insert('categories', {
        cafeId,
        name: CATEGORY_NAMES[i]!,
        position: i,
        archived: false,
        createdAt: now - days * DAY_MS,
      });
      categoryIds.push(id);
      bump('categories');
    }

    // ── Ingredients ───────────────────────────────────────────────────────────
    const ingredientIds: Id<'ingredients'>[] = [];
    for (const [name, unit, threshold, cost] of INGREDIENTS) {
      const id = await ctx.db.insert('ingredients', {
        cafeId,
        name,
        canonicalUnit: unit,
        reorderThreshold: threshold,
        lastCostPerUnitIDR: cost,
        archived: false,
        createdAt: now - days * DAY_MS,
      });
      ingredientIds.push(id);
      bump('ingredients');
    }

    // ── Modifier groups + options ─────────────────────────────────────────────
    // A handful of reusable groups; ~8 menu items will attach the relevant ones.
    type GroupSpec = {
      name: string;
      required: boolean;
      minSelect: number;
      maxSelect: number;
      options: ReadonlyArray<readonly [string, number]>;
    };
    const groupSpecs: GroupSpec[] = [
      {
        name: 'Tingkat Gula',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [['Normal', 0], ['Sedikit Gula', 0], ['Tanpa Gula', 0], ['Extra Manis', 0]],
      },
      {
        name: 'Suhu',
        required: true,
        minSelect: 1,
        maxSelect: 1,
        options: [['Panas', 0], ['Dingin', 2000]],
      },
      {
        name: 'Topping',
        required: false,
        minSelect: 0,
        maxSelect: 3,
        options: [['Extra Shot', 6000], ['Whipped Cream', 4000], ['Boba', 5000], ['Keju', 5000]],
      },
      {
        name: 'Level Pedas',
        required: false,
        minSelect: 0,
        maxSelect: 1,
        options: [['Tidak Pedas', 0], ['Sedang', 0], ['Pedas', 0], ['Extra Pedas', 2000]],
      },
    ];
    const groupIds: Id<'modifierGroups'>[] = [];
    const optionsByGroup: Id<'modifierOptions'>[][] = [];
    const optionDocs = new Map<
      Id<'modifierOptions'>,
      { groupName: string; name: string; priceAdjustmentIDR: number }
    >();
    for (const spec of groupSpecs) {
      const gid = await ctx.db.insert('modifierGroups', {
        cafeId,
        name: spec.name,
        required: spec.required,
        minSelect: spec.minSelect,
        maxSelect: spec.maxSelect,
        archived: false,
        createdAt: now - days * DAY_MS,
      });
      groupIds.push(gid);
      bump('modifierGroups');
      const optIds: Id<'modifierOptions'>[] = [];
      let pos = 0;
      for (const [oname, adj] of spec.options) {
        const oid = await ctx.db.insert('modifierOptions', {
          cafeId,
          groupId: gid,
          name: oname,
          priceAdjustmentIDR: adj,
          position: pos++,
          archived: false,
          createdAt: now - days * DAY_MS,
        });
        optIds.push(oid);
        optionDocs.set(oid, { groupName: spec.name, name: oname, priceAdjustmentIDR: adj });
        bump('modifierOptions');
      }
      optionsByGroup.push(optIds);
    }

    // ── Menu items ────────────────────────────────────────────────────────────
    type MenuMeta = {
      id: Id<'menuItems'>;
      categoryId: Id<'categories'>;
      name: string;
      priceIDR: number;
      archived: boolean;
      soldOut: boolean;
      variants: { id: Id<'menuItemVariants'>; name: string; priceIDR: number }[];
      modifierGroupIds: Id<'modifierGroups'>[];
    };
    const items: MenuMeta[] = [];
    for (let i = 0; i < MENU.length; i++) {
      const [name, catIdx, basePrice] = MENU[i]!;
      const archived = i % 22 === 21; // ~2 archived
      const soldOut = !archived && i % 23 === 7; // a couple sold out
      const barcode = i % 9 === 4 ? `899${String(100000 + i).padStart(7, '0')}` : undefined;
      const id = await ctx.db.insert('menuItems', {
        cafeId,
        categoryId: categoryIds[catIdx]!,
        name,
        priceIDR: basePrice,
        isActive: !archived,
        archived,
        ...(soldOut ? { soldOut: true } : {}),
        position: i,
        createdAt: now - days * DAY_MS,
        ...(barcode ? { barcode } : {}),
      });
      bump('menuItems');

      // ~10 items get S/M/L variants (drinks in the first 16).
      const variants: MenuMeta['variants'] = [];
      if (i < 16 && i % 2 === 0) {
        const sizes: ReadonlyArray<readonly [string, number]> = [
          ['S', basePrice - 3000],
          ['M', basePrice],
          ['L', basePrice + 5000],
        ];
        let vpos = 0;
        for (const [vn, vp] of sizes) {
          const vid = await ctx.db.insert('menuItemVariants', {
            cafeId,
            menuItemId: id,
            name: vn,
            priceIDR: Math.max(8000, vp),
            position: vpos++,
            archived: false,
            createdAt: now - days * DAY_MS,
          });
          variants.push({ id: vid, name: vn, priceIDR: Math.max(8000, vp) });
          bump('menuItemVariants');
        }
      }

      items.push({
        id,
        categoryId: categoryIds[catIdx]!,
        name,
        priceIDR: basePrice,
        archived,
        soldOut,
        variants,
        modifierGroupIds: [],
      });
    }

    // Wire modifier groups onto ~8 items (drinks → gula/suhu/topping; food → pedas).
    const drinkIdxs = [0, 2, 3, 6, 12, 14];
    const foodIdxs = [26, 27];
    for (const idx of drinkIdxs) {
      const item = items[idx]!;
      const groupSel = [groupIds[0]!, groupIds[1]!, groupIds[2]!];
      let pos = 0;
      for (const gid of groupSel) {
        await ctx.db.insert('menuItemModifierGroups', {
          cafeId,
          menuItemId: item.id,
          modifierGroupId: gid,
          position: pos++,
        });
        bump('menuItemModifierGroups');
      }
      item.modifierGroupIds = groupSel;
    }
    for (const idx of foodIdxs) {
      const item = items[idx]!;
      await ctx.db.insert('menuItemModifierGroups', {
        cafeId,
        menuItemId: item.id,
        modifierGroupId: groupIds[3]!,
        position: 0,
      });
      bump('menuItemModifierGroups');
      item.modifierGroupIds = [groupIds[3]!];
    }

    // ── Recipes ───────────────────────────────────────────────────────────────
    // Link ~20 sellable items to 1–3 ingredients. recipeSnapshot frozen onto
    // order lines later mirrors these (qty + wastageFactor), so COGS reconciles.
    type RecipeLine = { ingredientId: Id<'ingredients'>; qty: number; wastageFactor: number };
    const recipeByItem = new Map<Id<'menuItems'>, RecipeLine[]>();
    const sellable = items.filter((it) => !it.archived);
    for (let i = 0; i < Math.min(20, sellable.length); i++) {
      const it = sellable[i]!;
      const n = rng.i(1, 3);
      const chosen = rng.shuffle(ingredientIds).slice(0, n);
      const lines: RecipeLine[] = chosen.map((ingId) => ({
        ingredientId: ingId,
        qty: rng.i(5, 60),
        wastageFactor: rng.chance(0.3) ? 1.05 : 1,
      }));
      await ctx.db.insert('recipes', {
        cafeId,
        menuItemId: it.id,
        lines,
        updatedAt: now - days * DAY_MS,
      });
      recipeByItem.set(it.id, lines);
      bump('recipes');
    }

    // ── Inventory: opening + purchase stock-in per ingredient (positive stock) ──
    for (const ingId of ingredientIds) {
      const ing = await ctx.db.get(ingId);
      if (!ing) continue;
      // Opening stock far above threshold, plus a later purchase top-up.
      const opening = ing.reorderThreshold * rng.i(3, 8);
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: ingId,
        delta: opening,
        reason: 'purchase',
        reasonLabel: 'Stok awal',
        at: now - days * DAY_MS,
      });
      bump('inventoryMovements');
      const topup = ing.reorderThreshold * rng.i(1, 3);
      await ctx.db.insert('inventoryMovements', {
        cafeId,
        ingredientId: ingId,
        delta: topup,
        reason: 'purchase',
        reasonLabel: 'Pembelian rutin',
        at: now - rng.i(1, Math.max(1, days - 1)) * DAY_MS,
      });
      bump('inventoryMovements');
    }

    // ── Suppliers ─────────────────────────────────────────────────────────────
    const supplierIds: Id<'suppliers'>[] = [];
    for (const [name, phone] of SUPPLIERS) {
      const id = await ctx.db.insert('suppliers', {
        cafeId,
        name,
        phone,
        archived: false,
        createdAt: now - days * DAY_MS,
      });
      supplierIds.push(id);
      bump('suppliers');
    }

    // ── Purchases (~15) ─────────────────────────────────────────────────────────
    for (let i = 0; i < 15; i++) {
      const nLines = rng.i(2, 5);
      const chosen = rng.shuffle(ingredientIds).slice(0, nLines);
      const lines = chosen.map((ingId) => ({
        ingredientId: ingId,
        qty: rng.i(500, 5000),
        unitCostIDR: rng.money(10, 400, 5),
      }));
      const total = lines.reduce((s, l) => s + l.qty * l.unitCostIDR, 0);
      const at = dateInRange(rng, now, rng.i(0, days));
      await ctx.db.insert('purchases', {
        cafeId,
        supplierName: rng.pick(SUPPLIERS)[0],
        at,
        lines,
        totalIDR: total,
        createdAt: at,
      });
      bump('purchases');
    }

    // ── Purchase orders (~8, across status union) ──────────────────────────────
    const poStatuses = ['open', 'partial', 'received', 'cancelled'] as const;
    for (let i = 0; i < 8; i++) {
      const status = poStatuses[i % poStatuses.length]!;
      const nLines = rng.i(2, 4);
      const chosen = rng.shuffle(ingredientIds).slice(0, nLines);
      const lines = chosen.map((ingId) => {
        const ordered = rng.i(500, 4000);
        const received =
          status === 'received'
            ? ordered
            : status === 'partial'
              ? Math.floor(ordered / 2)
              : 0;
        return { ingredientId: ingId, orderedQty: ordered, receivedQty: received, unitCostIDR: rng.money(10, 400, 5) };
      });
      const supplier = rng.pick(supplierIds);
      const supplierDoc = await ctx.db.get(supplier);
      await ctx.db.insert('purchaseOrders', {
        cafeId,
        supplierId: supplier,
        ...(supplierDoc ? { supplierName: supplierDoc.name } : {}),
        status,
        lines,
        ...(rng.chance(0.4) ? { note: 'Pesanan rutin mingguan.' } : {}),
        createdAt: dateInRange(rng, now, rng.i(0, days)),
      });
      bump('purchaseOrders');
    }

    // ── Staff (~8: cashiers + managers; no second owner) ───────────────────────
    const staffIds: Id<'cafeStaff'>[] = [];
    for (let i = 0; i < STAFF_NAMES.length; i++) {
      const staffName = STAFF_NAMES[i]!;
      const isManager = staffName.includes('Manajer');
      const id = await ctx.db.insert('cafeStaff', {
        cafeId,
        name: staffName,
        // role union is only 'owner' | 'cashier'; managers are cashiers with
        // broader permissions (we never add a second owner).
        role: 'cashier',
        archived: false,
        createdAt: now - days * DAY_MS,
        phone: `0813${String(20000000 + i).padStart(8, '0')}`,
        email: `staff${i + 1}@kodapos.demo`,
        permissions: {
          canVoid: isManager,
          canDiscount: true,
          canManageShift: true,
          canViewReports: isManager,
          canEditMenu: isManager,
        },
        hourlyRateIDR: isManager ? rng.money(25000, 35000, 1000) : rng.money(15000, 22000, 1000),
      });
      staffIds.push(id);
      bump('cafeStaff');
    }

    // ── Tables (~12) ────────────────────────────────────────────────────────────
    const tableIds: Id<'tables'>[] = [];
    for (let i = 0; i < 12; i++) {
      const id = await ctx.db.insert('tables', {
        cafeId,
        name: i < 8 ? `Meja ${i + 1}` : `Outdoor ${i - 7}`,
        sortOrder: i,
        archived: false,
        createdAt: now - days * DAY_MS,
      });
      tableIds.push(id);
      bump('tables');
    }

    // ── Customers (~60) ─────────────────────────────────────────────────────────
    type CustomerMeta = { id: Id<'customers'>; pointsBalance: number; totalSpentIDR: number };
    const customers: CustomerMeta[] = [];
    for (let i = 0; i < 60; i++) {
      const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      const points = rng.i(0, 1500);
      const visits = rng.i(0, 40);
      const spent = visits * rng.money(15000, 90000, 1000);
      const id = await ctx.db.insert('customers', {
        cafeId,
        name,
        phone: `0812${String(10000000 + i).padStart(8, '0')}`,
        ...(rng.chance(0.2) ? { note: 'Pelanggan tetap.' } : {}),
        pointsBalance: points,
        visitCount: visits,
        totalSpentIDR: spent,
        ...(visits > 0 ? { lastVisitAt: dateInRange(rng, now, rng.i(0, days)) } : {}),
        archived: rng.chance(0.05),
        createdAt: now - rng.i(0, days) * DAY_MS,
      });
      customers.push({ id, pointsBalance: points, totalSpentIDR: spent });
      bump('customers');
    }
    const activeCustomers = customers; // includes a few archived; fine for ledger seed

    // ── Loyalty rewards (~6) ────────────────────────────────────────────────────
    const rewardSpecs: ReadonlyArray<readonly [string, number, number]> = [
      ['Diskon Rp10.000', 100, 10000],
      ['Diskon Rp25.000', 250, 25000],
      ['Gratis Kopi', 200, 22000],
      ['Gratis Pastry', 240, 24000],
      ['Diskon Rp50.000', 500, 50000],
      ['Voucher Spesial', 350, 35000],
    ];
    for (const [name, cost, disc] of rewardSpecs) {
      await ctx.db.insert('loyaltyRewards', {
        cafeId,
        name,
        pointsCost: cost,
        discountIDR: disc,
        archived: false,
        createdAt: now - days * DAY_MS,
      });
      bump('loyaltyRewards');
    }

    // ── Loyalty transactions (~40) ──────────────────────────────────────────────
    for (let i = 0; i < 40; i++) {
      const cust = rng.pick(activeCustomers);
      const type = rng.pick(['earn', 'earn', 'earn', 'redeem', 'adjust'] as const);
      const points =
        type === 'redeem' ? -rng.i(1, 5) * 100 : type === 'adjust' ? rng.i(-50, 50) : rng.i(5, 80);
      await ctx.db.insert('loyaltyTransactions', {
        cafeId,
        customerId: cust.id,
        type,
        points,
        ...(type === 'adjust' ? { note: 'Penyesuaian manual.' } : {}),
        at: dateInRange(rng, now, rng.i(0, days)),
      });
      bump('loyaltyTransactions');
    }

    // ── Gift cards (~20) + transactions (~30) ───────────────────────────────────
    const giftCardIds: Id<'giftCards'>[] = [];
    for (let i = 0; i < 20; i++) {
      const inactive = rng.chance(0.15);
      const balance = inactive ? 0 : rng.money(0, 500000, 5000);
      const id = await ctx.db.insert('giftCards', {
        cafeId,
        code: genCode(rng, 'GC', 8),
        balanceIDR: balance,
        status: inactive ? 'archived' : 'active',
        createdAt: now - rng.i(0, days) * DAY_MS,
      });
      giftCardIds.push(id);
      bump('giftCards');
      // Issue ledger row for the initial balance.
      await ctx.db.insert('giftCardTransactions', {
        cafeId,
        giftCardId: id,
        type: 'issue',
        amountIDR: balance,
        at: now - rng.i(0, days) * DAY_MS,
      });
      bump('giftCardTransactions');
    }
    // ~10 more topup/redeem rows.
    for (let i = 0; i < 10; i++) {
      const gc = rng.pick(giftCardIds);
      const type = rng.pick(['topup', 'redeem'] as const);
      await ctx.db.insert('giftCardTransactions', {
        cafeId,
        giftCardId: gc,
        type,
        amountIDR: type === 'topup' ? rng.money(50000, 200000, 5000) : -rng.money(10000, 80000, 5000),
        at: dateInRange(rng, now, rng.i(0, days)),
      });
      bump('giftCardTransactions');
    }

    // ── Promotions (~10, across type/scope, a few archived + coded) ─────────────
    const promoSpecs: Array<{
      name: string;
      type: 'percent' | 'fixed';
      value: number;
      scope?: 'order' | 'item' | 'category';
      withCode?: boolean;
      archived?: boolean;
    }> = [
      { name: 'Diskon Pembukaan 10%', type: 'percent', value: 10, scope: 'order', withCode: true },
      { name: 'Potongan Rp5.000', type: 'fixed', value: 5000, scope: 'order' },
      { name: 'Hemat Kopi 15%', type: 'percent', value: 15, scope: 'category' },
      { name: 'Pastry Murah', type: 'fixed', value: 8000, scope: 'category' },
      { name: 'Promo Es Kopi Susu', type: 'percent', value: 20, scope: 'item', withCode: true },
      { name: 'Diskon Akhir Pekan', type: 'percent', value: 12, scope: 'order' },
      { name: 'Member Spesial', type: 'fixed', value: 15000, scope: 'order', withCode: true },
      { name: 'Promo Lama (Arsip)', type: 'percent', value: 25, scope: 'order', archived: true },
      { name: 'Diskon Camilan', type: 'percent', value: 10, scope: 'category' },
      { name: 'Voucher Rp20.000', type: 'fixed', value: 20000, scope: 'order', archived: true },
    ];
    for (const p of promoSpecs) {
      const target: Record<string, unknown> = {};
      if (p.scope === 'item') target.targetItemIds = [items[0]!.id];
      if (p.scope === 'category') target.targetCategoryIds = [categoryIds[rng.i(0, categoryIds.length - 1)]!];
      await ctx.db.insert('promotions', {
        cafeId,
        name: p.name,
        type: p.type,
        value: p.value,
        ...(p.withCode ? { code: genCode(rng, 'PROMO', 4) } : {}),
        ...(p.scope ? { scope: p.scope } : {}),
        ...target,
        archived: p.archived ?? false,
        createdAt: now - rng.i(0, days) * DAY_MS,
      });
      bump('promotions');
    }

    // ── Reservations (~15, across statuses) ─────────────────────────────────────
    const resStatuses = ['booked', 'seated', 'completed', 'cancelled', 'no_show'] as const;
    for (let i = 0; i < 15; i++) {
      const status = resStatuses[i % resStatuses.length]!;
      const cust = rng.chance(0.6) ? rng.pick(activeCustomers) : null;
      // Past for completed/no_show/cancelled, future-ish for booked/seated.
      const offset = status === 'booked' || status === 'seated' ? -rng.i(0, 5) : rng.i(0, days);
      await ctx.db.insert('reservations', {
        cafeId,
        ...(rng.chance(0.7) ? { tableId: rng.pick(tableIds) } : {}),
        ...(cust ? { customerId: cust.id } : {}),
        customerName: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
        ...(rng.chance(0.8) ? { phone: `0812${String(70000000 + i).padStart(8, '0')}` } : {}),
        partySize: rng.i(1, 8),
        at: now - offset * DAY_MS + rng.i(8, 21) * 3_600_000,
        durationMin: rng.pick([60, 90, 120]),
        status,
        ...(rng.chance(0.3) ? { note: 'Dekat jendela.' } : {}),
        createdAt: now - rng.i(0, days) * DAY_MS,
      });
      bump('reservations');
    }

    // ── Scheduled shifts (~20) ──────────────────────────────────────────────────
    for (let i = 0; i < 20; i++) {
      const at = now - rng.i(0, days) * DAY_MS;
      const startH = rng.pick([7, 8, 9, 14, 15]);
      await ctx.db.insert('scheduledShifts', {
        cafeId,
        staffId: rng.pick(staffIds),
        date: dateKey(at),
        startTime: timeStr(startH, 0),
        endTime: timeStr(startH + 8, 0),
        ...(rng.chance(0.25) ? { note: 'Shift sore.' } : {}),
        createdAt: now - rng.i(0, days) * DAY_MS,
      });
      bump('scheduledShifts');
    }

    // ── Time clock (~30, some still clocked in) ─────────────────────────────────
    for (let i = 0; i < 30; i++) {
      const clockIn = dateInRange(rng, now, rng.i(0, days));
      const stillIn = rng.chance(0.15);
      await ctx.db.insert('timeClock', {
        cafeId,
        cashierId: rng.pick(staffIds),
        clockInAt: clockIn,
        ...(stillIn ? {} : { clockOutAt: clockIn + rng.i(4, 9) * 3_600_000 }),
      });
      bump('timeClock');
    }

    // ── Shifts (~30, spread across days; closed with opening/closing cash) ──────
    // We tie orders + cash movements to these shifts. The last one is left open.
    type ShiftMeta = { id: Id<'shifts'>; cashierId: Id<'cafeStaff'>; openedAt: number; dayIndex: number; closed: boolean };
    const shiftCount = 30;
    const shifts: ShiftMeta[] = [];
    for (let i = 0; i < shiftCount; i++) {
      // Spread evenly across the window, newest shift last.
      const dayIndex = Math.floor((i / shiftCount) * days);
      const openedAt = dateInRange(rng, now, days - 1 - dayIndex);
      const cashierId = rng.pick(staffIds);
      const openingFloat = rng.money(200000, 500000, 50000);
      const isOpen = i === shiftCount - 1; // keep the most recent open
      const id = await ctx.db.insert('shifts', {
        cafeId,
        cashierId,
        openedAt,
        openingFloatIDR: openingFloat,
        status: isOpen ? 'open' : 'closed',
        ...(isOpen ? {} : { closedAt: openedAt + rng.i(6, 10) * 3_600_000 }),
      });
      shifts.push({ id, cashierId, openedAt, dayIndex, closed: !isOpen });
      bump('shifts');
    }

    // ── Cash movements (~25, tied to shifts) ────────────────────────────────────
    for (let i = 0; i < 25; i++) {
      const shift = rng.pick(shifts);
      const direction = rng.pick(['in', 'out'] as const);
      await ctx.db.insert('cashMovements', {
        cafeId,
        shiftId: shift.id,
        cashierId: shift.cashierId,
        direction,
        amountIDR: rng.money(20000, 200000, 10000),
        ...(rng.chance(0.6)
          ? { note: direction === 'in' ? 'Tambah modal kas.' : 'Bayar kurir / belanja kecil.' }
          : {}),
        at: shift.openedAt + rng.i(1, 5) * 3_600_000,
      });
      bump('cashMovements');
    }

    // ── Orders (~380) + payments — MIRRORS convex/lib/sale.ts buildOrder ────────
    // For each order we pick a shift (so createdAtClient sits inside its day),
    // build line snapshots from real menu items (incl. variants/modifiers +
    // recipeSnapshot), compute totals via the same formula as computeOrderTotals,
    // and insert matching payment row(s) with paymentBreakdown + confirmedAt.
    const sellableForSale = items.filter((it) => !it.archived && !it.soldOut);
    const orderTypes = ['dine_in', 'takeaway', 'pickup'] as const;
    const ORDER_COUNT = 380;
    let clientCounter = 0;
    const paidOrderIds: Id<'orders'>[] = [];

    for (let i = 0; i < ORDER_COUNT; i++) {
      const shift = rng.pick(shifts);
      // createdAtClient within the shift's open window (and not in the future).
      const span = (shift.closed ? 8 : 4) * 3_600_000;
      let createdAtClient = shift.openedAt + Math.floor(rng.f() * span);
      if (createdAtClient > now) createdAtClient = now - rng.i(1, 60) * 60_000;

      // Build 1–4 lines.
      const lineCount = rng.i(1, 4);
      const builtLines: Doc<'orders'>['lines'] = [];
      for (let l = 0; l < lineCount; l++) {
        const it = rng.pick(sellableForSale);
        const qty = rng.i(1, 3);

        // Variant (server-authoritative price replaces base).
        let basePrice = it.priceIDR;
        let variantId: Id<'menuItemVariants'> | undefined;
        let variantName: string | undefined;
        if (it.variants.length > 0 && rng.chance(0.6)) {
          const variant = rng.pick(it.variants);
          basePrice = variant.priceIDR;
          variantId = variant.id;
          variantName = variant.name;
        }

        // Modifiers: one option per attached group's first applicable choice.
        const modifiersSnapshot: Doc<'orders'>['lines'][number]['modifiersSnapshot'] = [];
        let modAdj = 0;
        for (const gid of it.modifierGroupIds) {
          const gIdx = groupIds.indexOf(gid);
          const opts = optionsByGroup[gIdx] ?? [];
          if (opts.length === 0) continue;
          const spec = groupSpecs[gIdx];
          if (!spec) continue;
          // Always satisfy required single-select; optionally add an optional one.
          if (spec.required || rng.chance(0.4)) {
            const oid = rng.pick(opts);
            const od = optionDocs.get(oid);
            if (od) {
              modifiersSnapshot.push({
                groupName: od.groupName,
                optionName: od.name,
                priceAdjustmentIDR: od.priceAdjustmentIDR,
              });
              modAdj += od.priceAdjustmentIDR;
            }
          }
        }

        const unitPriceIDR = basePrice + modAdj;
        const lineTotalIDR = qty * unitPriceIDR;
        const recipe = recipeByItem.get(it.id) ?? [];
        builtLines.push({
          menuItemId: it.id,
          nameSnapshot: it.name,
          qty,
          unitPriceIDR,
          modifiersSnapshot,
          lineTotalIDR,
          ...(variantId ? { variantId, variantName: variantName! } : {}),
          recipeSnapshot: recipe.map((r) => ({
            ingredientId: r.ingredientId,
            qty: r.qty,
            wastageFactor: r.wastageFactor,
          })),
        });
      }

      const subtotalIDR = builtLines.reduce((s, l) => s + l.lineTotalIDR, 0);

      // A minority of orders carry a discount (kept arithmetically exact).
      let discountIDR = 0;
      if (rng.chance(0.15)) {
        if (rng.chance(0.5)) {
          // percent 10%
          discountIDR = Math.round((subtotalIDR * 10) / 100);
        } else {
          // fixed, clamped to subtotal
          discountIDR = Math.min(subtotalIDR, rng.money(5000, 20000, 5000));
        }
      }

      // Totals — exactly computeOrderTotals(subtotal, discount, SC off, tax cfg).
      const base = subtotalIDR - discountIDR;
      const serviceChargeIDR = SC_ENABLED ? Math.round((base * SC_PCT) / 100) : 0;
      const taxIDR = taxEnabled ? Math.round(((base + serviceChargeIDR) * taxRatePct) / 100) : 0;
      const totalIDR = base + serviceChargeIDR + taxIDR;

      // Customer link (~30%) + loyalty earn (subtotal − discount base, floored).
      let customerId: Id<'customers'> | undefined;
      let pointsEarned = 0;
      if (rng.chance(0.3)) {
        const cust = rng.pick(activeCustomers);
        customerId = cust.id;
        const earnBase = subtotalIDR - discountIDR;
        const mult =
          cust.totalSpentIDR >= 2_000_000 ? 1.5 : cust.totalSpentIDR >= 500_000 ? 1.25 : 1;
        pointsEarned = Math.floor(Math.floor(earnBase / loyaltyCfg.earnRatePerIDR) * mult);
      }

      // Payment method mix: mostly cash + qris_static, a few split.
      type Breakdown = { method: 'cash' | 'qris_static' | 'qris_dynamic' | 'giftcard'; amountIDR: number };
      let orderMethod: 'cash' | 'qris_static' | 'qris_dynamic' | 'giftcard' | 'split';
      let paymentBreakdown: Breakdown[];
      // payment-row plans mirror buildOrder: cash carries tendered/change.
      type PayRow = {
        method: 'cash' | 'qris_static' | 'qris_dynamic' | 'giftcard';
        amountIDR: number;
        cashTenderedIDR?: number;
        changeIDR?: number;
      };
      let payRows: PayRow[];

      const roll = rng.f();
      if (roll < 0.55) {
        // cash
        orderMethod = 'cash';
        const tendered = Math.ceil(totalIDR / 5000) * 5000 + (rng.chance(0.4) ? 5000 : 0);
        paymentBreakdown = [{ method: 'cash', amountIDR: totalIDR }];
        payRows = [{ method: 'cash', amountIDR: totalIDR, cashTenderedIDR: tendered, changeIDR: tendered - totalIDR }];
      } else if (roll < 0.9) {
        // qris_static
        orderMethod = 'qris_static';
        paymentBreakdown = [{ method: 'qris_static', amountIDR: totalIDR }];
        payRows = [{ method: 'qris_static', amountIDR: totalIDR }];
      } else {
        // split cash + qris_static (sums exactly to total)
        orderMethod = 'split';
        const cashPart = Math.min(totalIDR, Math.max(5000, Math.round(totalIDR / 2 / 1000) * 1000));
        const qrisPart = totalIDR - cashPart;
        if (qrisPart <= 0) {
          // Degenerate (tiny total): fall back to single cash.
          orderMethod = 'cash';
          const tendered = Math.ceil(totalIDR / 5000) * 5000;
          paymentBreakdown = [{ method: 'cash', amountIDR: totalIDR }];
          payRows = [{ method: 'cash', amountIDR: totalIDR, cashTenderedIDR: tendered, changeIDR: tendered - totalIDR }];
        } else {
          paymentBreakdown = [
            { method: 'cash', amountIDR: cashPart },
            { method: 'qris_static', amountIDR: qrisPart },
          ];
          payRows = [
            { method: 'cash', amountIDR: cashPart, cashTenderedIDR: cashPart, changeIDR: 0 },
            { method: 'qris_static', amountIDR: qrisPart },
          ];
        }
      }

      // paymentStatus: majority paid; some void; some "refunded" (paid + refund row).
      const statusRoll = rng.f();
      const isVoid = statusRoll < 0.05;
      const willRefund = !isVoid && statusRoll < 0.13; // paid then refunded

      const orderType = rng.pick(orderTypes);
      const tableId = orderType === 'dine_in' && rng.chance(0.7) ? rng.pick(tableIds) : undefined;
      const clientId = `seed-${args.seed ?? 12345}-${clientCounter++}`;

      const orderId = await ctx.db.insert('orders', {
        cafeId,
        shiftId: shift.id,
        cashierId: shift.cashierId,
        clientId,
        lines: builtLines,
        subtotalIDR,
        taxRatePct,
        taxIDR,
        discountIDR,
        serviceChargeIDR,
        serviceChargePct: SC_PCT,
        serviceChargeName: SC_NAME,
        ...(customerId ? { customerId, pointsEarned } : {}),
        totalIDR,
        orderType,
        ...(tableId ? { tableId } : {}),
        paymentMethod: orderMethod,
        paymentBreakdown,
        paymentStatus: isVoid ? 'void' : 'paid',
        ...(isVoid
          ? { voidedAt: createdAtClient + 600_000, voidReason: 'Salah input pesanan.' }
          : { kitchenStatus: rng.pick(['new', 'ready', 'done'] as const) }),
        ...(willRefund ? { refundedIDR: totalIDR } : {}),
        createdAtClient,
        syncedAt: createdAtClient,
      });
      bump('orders');
      if (!isVoid) paidOrderIds.push(orderId);

      // Payment rows mirror buildOrder + settleSale (confirmedAt set when paid).
      const confirmedAt = isVoid ? undefined : createdAtClient;
      for (const pr of payRows) {
        await ctx.db.insert('payments', {
          cafeId,
          orderId,
          method: pr.method,
          amountIDR: pr.amountIDR,
          ...(pr.cashTenderedIDR !== undefined ? { cashTenderedIDR: pr.cashTenderedIDR } : {}),
          ...(pr.changeIDR !== undefined ? { changeIDR: pr.changeIDR } : {}),
          ...(confirmedAt !== undefined ? { confirmedAt } : {}),
        });
        bump('payments');
      }

      // Inventory deduction for PAID orders (mirror settleSale; void orders net
      // to zero so we simply skip them).
      if (!isVoid) {
        for (const line of builtLines) {
          for (const rl of line.recipeSnapshot ?? []) {
            const consumed = line.qty * rl.qty * rl.wastageFactor;
            await ctx.db.insert('inventoryMovements', {
              cafeId,
              ingredientId: rl.ingredientId,
              delta: -consumed,
              reason: 'sale',
              refType: 'order',
              refId: orderId as unknown as string,
              at: createdAtClient,
            });
            bump('inventoryMovements');
          }
        }
        // Loyalty earn ledger row (mirror settleSale) when a customer + points.
        if (customerId && pointsEarned > 0) {
          await ctx.db.insert('loyaltyTransactions', {
            cafeId,
            customerId,
            orderId,
            type: 'earn',
            points: pointsEarned,
            at: createdAtClient,
          });
          bump('loyaltyTransactions');
        }
      }

      // A refund ledger row for the "refunded" subset (dashboard/reports net it).
      if (willRefund) {
        const refundMethod = paymentBreakdown[0]!.method;
        await ctx.db.insert('refunds', {
          cafeId,
          orderId,
          shiftId: shift.id,
          cashierId: shift.cashierId,
          clientId: `refund-${clientId}`,
          method: refundMethod === 'qris_static' || refundMethod === 'cash' ? refundMethod : 'cash',
          amountIDR: totalIDR,
          lines: builtLines.map((l, lineIndex) => ({
            lineIndex,
            nameSnapshot: l.nameSnapshot,
            qty: l.qty,
            lineRefundIDR: l.lineTotalIDR,
          })),
          reason: 'Pelanggan komplain.',
          at: createdAtClient + 3_600_000,
        });
        bump('refunds');
      }
    }

    // ── Expenses (~40, across categories + dates) ───────────────────────────────
    const expenseCats = ['rent', 'utilities', 'supplies', 'salary', 'other'] as const;
    const expenseNotes: Record<string, string[]> = {
      rent: ['Sewa kios bulanan'],
      utilities: ['Token listrik', 'Tagihan air', 'Internet & WiFi'],
      supplies: ['Beli gelas plastik', 'Tisu & sedotan', 'Pembersih lantai'],
      salary: ['Gaji barista', 'Bonus harian'],
      other: ['Biaya promosi', 'Perbaikan mesin kopi', 'Pajak & retribusi'],
    };
    for (let i = 0; i < 40; i++) {
      const cat = rng.pick(expenseCats);
      const amount =
        cat === 'rent' ? rng.money(3000000, 6000000, 100000)
        : cat === 'salary' ? rng.money(1500000, 4000000, 100000)
        : cat === 'utilities' ? rng.money(200000, 1200000, 50000)
        : rng.money(50000, 800000, 10000);
      await ctx.db.insert('expenses', {
        cafeId,
        category: cat,
        amountIDR: amount,
        ...(rng.chance(0.7) ? { note: rng.pick(expenseNotes[cat]!) } : {}),
        at: dateInRange(rng, now, rng.i(0, days)),
      });
      bump('expenses');
    }

    // ── Other income (~15) ──────────────────────────────────────────────────────
    const incomeSources = ['Sewa ruang acara', 'Penjualan merchandise', 'Jasa katering', 'Komisi rekanan', 'Penjualan biji kopi'];
    for (let i = 0; i < 15; i++) {
      await ctx.db.insert('otherIncome', {
        cafeId,
        source: rng.pick(incomeSources),
        amountIDR: rng.money(50000, 1500000, 25000),
        ...(rng.chance(0.5) ? { note: 'Pemasukan tambahan.' } : {}),
        at: dateInRange(rng, now, rng.i(0, days)),
      });
      bump('otherIncome');
    }

    // ── Forecasts (a couple) + restock suggestions (a handful) ──────────────────
    const forecastIds: Id<'forecasts'>[] = [];
    for (let f = 0; f < 2; f++) {
      const generatedAt = now - f * DAY_MS;
      const ready = f === 0;
      const forecastLines = sellableForSale.slice(0, 8).map((it) => ({
        menuItemId: it.id,
        name: it.name,
        tomorrowQty: rng.i(5, 40),
        sevenDayQty: rng.i(40, 250),
        confidence: rng.pick(['low', 'med', 'high'] as const),
        drivers: [
          { code: rng.pick(['dow_busy', 'dow_quiet'] as const), pct: rng.i(-20, 30), dow: rng.i(0, 6) },
        ],
      }));
      const id = await ctx.db.insert('forecasts', {
        cafeId,
        generatedAt,
        method: 'rule_v1',
        status: ready ? 'ready' : 'learning',
        daysCollected: ready ? rng.i(14, 60) : rng.i(1, 10),
        ...(ready
          ? {
              etaDateKey: dateKey(now + DAY_MS),
              forDateKey: dateKey(now + DAY_MS),
              lines: forecastLines,
            }
          : {}),
      });
      forecastIds.push(id);
      bump('forecasts');
    }

    // Restock suggestions referencing the ready forecast.
    const restockStatuses = ['draft', 'sent', 'dismissed'] as const;
    for (let r = 0; r < 3; r++) {
      const chosen = rng.shuffle(ingredientIds).slice(0, rng.i(3, 6));
      const lines = [];
      for (const ingId of chosen) {
        const ing = await ctx.db.get(ingId);
        if (!ing) continue;
        lines.push({
          ingredientId: ingId,
          name: ing.name,
          unit: ing.canonicalUnit,
          suggestedQty: ing.reorderThreshold * rng.i(2, 5),
          currentStockQty: rng.i(0, ing.reorderThreshold),
        });
      }
      const status = restockStatuses[r % restockStatuses.length]!;
      await ctx.db.insert('restockSuggestions', {
        cafeId,
        forecastId: forecastIds[0]!,
        generatedAt: now - r * DAY_MS,
        status,
        lines,
        ...(rng.chance(0.6) ? { supplierId: rng.pick(supplierIds) } : {}),
        ...(status === 'sent'
          ? {
              sentLines: lines.map((l) => ({ name: l.name, qty: l.suggestedQty, unit: l.unit })),
              exportedAt: now - r * DAY_MS,
            }
          : {}),
      });
      bump('restockSuggestions');
    }

    return {
      cafeId,
      days,
      seed: args.seed ?? 12345,
      purged: args.purge === true,
      ...counts,
    };
  },
});
