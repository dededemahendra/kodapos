import { convexTest } from 'convex-test';
import { describe, expect, it } from 'vitest';
import { api } from '../../convex/_generated/api';
import schema from '../../convex/schema';

const modules = import.meta.glob('../../convex/**/*.*s');

async function setup(t: ReturnType<typeof convexTest>, email = 'o@x.com') {
  const userId = await t.run(async (ctx) =>
    ctx.db.insert('users', { name: 'Owner', email })
  );
  const asOwner = t.withIdentity({ subject: `${userId}|test_session` });
  await asOwner.mutation(api.cafes.createForOwner, { name: 'Kopi Senja' });
  const biji = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Biji', canonicalUnit: 'g', reorderThreshold: 0, lastCostPerUnitIDR: 40,
  });
  const susu = await asOwner.mutation(api.ingredients.upsert, {
    name: 'Susu', canonicalUnit: 'ml', reorderThreshold: 0, lastCostPerUnitIDR: 20,
  });
  const supplier = await asOwner.mutation(api.suppliers.create, {
    name: 'Kopi Jaya', phone: '08123456789',
  });
  return { asOwner, biji, susu, supplier };
}

describe('purchaseOrders.create', () => {
  it('inserts an open PO with receivedQty 0; get + list return it', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [
        { ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 },
        { ingredientId: susu, orderedQty: 10000, unitCostIDR: 25 },
      ],
    });
    expect(id).toBeTruthy();

    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('open');
    expect(detail?.supplierName).toBe('Kopi Jaya');
    expect(detail?.lines).toHaveLength(2);
    const bijiLine = detail?.lines.find((l) => l.ingredientName === 'Biji');
    expect(bijiLine?.orderedQty).toBe(5000);
    expect(bijiLine?.receivedQty).toBe(0);
    expect(bijiLine?.remainingQty).toBe(5000);
    expect(bijiLine?.unit).toBe('g');
    expect(bijiLine?.unitCostIDR).toBe(50);

    const list = await asOwner.query(api.purchaseOrders.list, {});
    expect(list).toHaveLength(1);
    expect(list[0]?._id).toBe(id);
    expect(list[0]?.status).toBe('open');
    expect(list[0]?.lineCount).toBe(2);
    // ordered total = 5000×50 + 10000×25 = 250000 + 250000 = 500000
    expect(list[0]?.orderedTotalIDR).toBe(500000);
    expect(list[0]?.receivedTotalIDR).toBe(0);
    expect(list[0]?.supplierName).toBe('Kopi Jaya');
  });

  it('creates without a supplier', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      lines: [{ ingredientId: biji, orderedQty: 100, unitCostIDR: 40 }],
    });
    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('open');
    expect(detail?.supplierName).toBeUndefined();
  });

  it('rejects empty lines / non-positive qty / archived ingredient / foreign supplier', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu } = await setup(t);
    await expect(
      asOwner.mutation(api.purchaseOrders.create, { lines: [] })
    ).rejects.toThrow(/minimal satu/i);
    await expect(
      asOwner.mutation(api.purchaseOrders.create, {
        lines: [{ ingredientId: biji, orderedQty: 0, unitCostIDR: 10 }],
      })
    ).rejects.toThrow(/jumlah/i);
    await expect(
      asOwner.mutation(api.purchaseOrders.create, {
        lines: [{ ingredientId: biji, orderedQty: 5, unitCostIDR: -1 }],
      })
    ).rejects.toThrow(/biaya/i);
    // archived ingredient
    await asOwner.mutation(api.ingredients.archive, { id: susu });
    await expect(
      asOwner.mutation(api.purchaseOrders.create, {
        lines: [{ ingredientId: susu, orderedQty: 5, unitCostIDR: 10 }],
      })
    ).rejects.toThrow(/tidak ditemukan/i);
    // foreign supplier
    const { supplier: otherSupplier } = await setup(t, 'b@x.com');
    await expect(
      asOwner.mutation(api.purchaseOrders.create, {
        supplierId: otherSupplier,
        lines: [{ ingredientId: biji, orderedQty: 5, unitCostIDR: 10 }],
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('rejects duplicate ingredient across lines', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji } = await setup(t);
    await expect(
      asOwner.mutation(api.purchaseOrders.create, {
        lines: [
          { ingredientId: biji, orderedQty: 100, unitCostIDR: 40 },
          { ingredientId: biji, orderedQty: 50, unitCostIDR: 45 },
        ],
      })
    ).rejects.toThrow(/duplikat/i);
  });
});

describe('purchaseOrders.receive', () => {
  it('partial receive bumps line, sets partial, raises stock + updates cost', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await asOwner.mutation(api.purchaseOrders.receive, {
      id,
      lines: [{ ingredientId: biji, qty: 2000 }],
    });

    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('partial');
    const line = detail?.lines.find((l) => l.ingredientName === 'Biji');
    expect(line?.receivedQty).toBe(2000);
    expect(line?.remainingQty).toBe(3000);

    // Stock up by exactly the received qty (one purchase movement).
    const bijiRow = await asOwner.query(api.ingredients.get, { id: biji });
    expect(bijiRow?.currentStockQty).toBe(2000);
    // lastCost = the PO line's unit cost (not the ingredient's old 40).
    expect(bijiRow?.lastCostPerUnitIDR).toBe(50);

    const { rows } = await asOwner.query(api.ingredients.listMovements, {
      ingredientId: biji,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.reason).toBe('purchase');
    expect(rows[0]?.delta).toBe(2000);

    // list received total reflects partial = 2000×50 = 100000
    const list = await asOwner.query(api.purchaseOrders.list, {});
    expect(list[0]?.receivedTotalIDR).toBe(100000);
  });

  it('receiving all lines fully sets received; a further receive rejects', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [
        { ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 },
        { ingredientId: susu, orderedQty: 10000, unitCostIDR: 25 },
      ],
    });
    await asOwner.mutation(api.purchaseOrders.receive, {
      id,
      lines: [
        { ingredientId: biji, qty: 5000 },
        { ingredientId: susu, qty: 10000 },
      ],
    });
    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('received');

    const bijiRow = await asOwner.query(api.ingredients.get, { id: biji });
    expect(bijiRow?.currentStockQty).toBe(5000);
    const susuRow = await asOwner.query(api.ingredients.get, { id: susu });
    expect(susuRow?.currentStockQty).toBe(10000);

    // No further receive on a received PO.
    await expect(
      asOwner.mutation(api.purchaseOrders.receive, {
        id,
        lines: [{ ingredientId: biji, qty: 1 }],
      })
    ).rejects.toThrow(/selesai|received/i);
  });

  it('over-receipt rejects and applies nothing (stock unchanged)', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await expect(
      asOwner.mutation(api.purchaseOrders.receive, {
        id,
        lines: [{ ingredientId: biji, qty: 6000 }],
      })
    ).rejects.toThrow(/melebihi/i);

    // Nothing applied: stock still 0, line still receivedQty 0, status open.
    const bijiRow = await asOwner.query(api.ingredients.get, { id: biji });
    expect(bijiRow?.currentStockQty).toBe(0);
    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('open');
    expect(detail?.lines[0]?.receivedQty).toBe(0);
  });

  it('over-receipt after a partial (receivedQty + qty > orderedQty) rejects', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await asOwner.mutation(api.purchaseOrders.receive, {
      id,
      lines: [{ ingredientId: biji, qty: 3000 }],
    });
    await expect(
      asOwner.mutation(api.purchaseOrders.receive, {
        id,
        lines: [{ ingredientId: biji, qty: 3000 }],
      })
    ).rejects.toThrow(/melebihi/i);
    // Still only the partial applied.
    const bijiRow = await asOwner.query(api.ingredients.get, { id: biji });
    expect(bijiRow?.currentStockQty).toBe(3000);
  });

  it('rejects non-positive qty and unknown line ingredient', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, susu, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await expect(
      asOwner.mutation(api.purchaseOrders.receive, {
        id,
        lines: [{ ingredientId: biji, qty: 0 }],
      })
    ).rejects.toThrow(/jumlah/i);
    // susu is not a line on this PO.
    await expect(
      asOwner.mutation(api.purchaseOrders.receive, {
        id,
        lines: [{ ingredientId: susu, qty: 10 }],
      })
    ).rejects.toThrow(/tidak ditemukan/i);
  });

  it('rejects duplicate ingredient in one receive call and applies nothing', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await expect(
      asOwner.mutation(api.purchaseOrders.receive, {
        id,
        lines: [
          { ingredientId: biji, qty: 1 },
          { ingredientId: biji, qty: 1 },
        ],
      })
    ).rejects.toThrow(/duplikat/i);

    // Nothing applied: stock still 0, line receivedQty still 0, status open.
    const bijiRow = await asOwner.query(api.ingredients.get, { id: biji });
    expect(bijiRow?.currentStockQty).toBe(0);
    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('open');
    expect(detail?.lines[0]?.receivedQty).toBe(0);
  });
});

describe('purchaseOrders.cancel', () => {
  it('cancels an open PO; stock unchanged', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await asOwner.mutation(api.purchaseOrders.cancel, { id });
    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('cancelled');
    const bijiRow = await asOwner.query(api.ingredients.get, { id: biji });
    expect(bijiRow?.currentStockQty).toBe(0);
  });

  it('cancels a partial PO without reversing received stock', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await asOwner.mutation(api.purchaseOrders.receive, {
      id,
      lines: [{ ingredientId: biji, qty: 2000 }],
    });
    await asOwner.mutation(api.purchaseOrders.cancel, { id });
    const detail = await asOwner.query(api.purchaseOrders.get, { id });
    expect(detail?.status).toBe('cancelled');
    // Cancel does NOT reverse the already-received 2000.
    const bijiRow = await asOwner.query(api.ingredients.get, { id: biji });
    expect(bijiRow?.currentStockQty).toBe(2000);
  });

  it('rejects cancelling a received PO', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 5000, unitCostIDR: 50 }],
    });
    await asOwner.mutation(api.purchaseOrders.receive, {
      id,
      lines: [{ ingredientId: biji, qty: 5000 }],
    });
    await expect(
      asOwner.mutation(api.purchaseOrders.cancel, { id })
    ).rejects.toThrow(/selesai|dibatalkan|received/i);
  });
});

describe('purchaseOrders owner-scope', () => {
  it('foreign PO id throws on get/receive/cancel and list is cafe-scoped', async () => {
    const t = convexTest(schema, modules);
    const { asOwner, biji, supplier } = await setup(t);
    const id = await asOwner.mutation(api.purchaseOrders.create, {
      supplierId: supplier,
      lines: [{ ingredientId: biji, orderedQty: 100, unitCostIDR: 40 }],
    });
    const { asOwner: ownerB, biji: bijiB } = await setup(t, 'b@x.com');
    // list is cafe-scoped.
    expect(await ownerB.query(api.purchaseOrders.list, {})).toHaveLength(0);
    // get returns null for a foreign PO.
    expect(await ownerB.query(api.purchaseOrders.get, { id })).toBeNull();
    // receive/cancel a foreign PO throw.
    await expect(
      ownerB.mutation(api.purchaseOrders.receive, {
        id,
        lines: [{ ingredientId: bijiB, qty: 1 }],
      })
    ).rejects.toThrow(/tidak ditemukan/i);
    await expect(
      ownerB.mutation(api.purchaseOrders.cancel, { id })
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});
