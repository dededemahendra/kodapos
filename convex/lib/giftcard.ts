import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/**
 * Redeems `amountIDR` from an active gift card (resolved by its cafe-scoped,
 * uppercased code), deducting the balance and writing a signed `redeem` ledger
 * row. Server-authoritative: the card's stored `balanceIDR` is the source of
 * truth and the amount is validated ≤ balance, so the balance can never go
 * negative. Returns the card id so the caller can stamp the payment row (used by
 * void to refund the right card).
 */
export async function redeemGiftCard(
  ctx: MutationCtx,
  cafeId: Id<'cafes'>,
  code: string,
  amountIDR: number,
  orderId: Id<'orders'>
): Promise<Id<'giftCards'>> {
  const normalized = code.trim().toUpperCase();
  const card = await ctx.db
    .query('giftCards')
    .withIndex('by_cafe_code', (q) => q.eq('cafeId', cafeId).eq('code', normalized))
    .first();
  if (!card || card.status !== 'active') {
    throw new Error('Kartu hadiah tidak ditemukan.');
  }
  if (!Number.isInteger(amountIDR) || amountIDR <= 0) {
    throw new Error('Jumlah tidak valid.');
  }
  if (card.balanceIDR < amountIDR) {
    throw new Error('Saldo kartu hadiah tidak cukup.');
  }
  await ctx.db.patch(card._id, { balanceIDR: card.balanceIDR - amountIDR });
  await ctx.db.insert('giftCardTransactions', {
    cafeId,
    giftCardId: card._id,
    type: 'redeem',
    amountIDR: -amountIDR,
    orderId,
    at: Date.now(),
  });
  return card._id;
}
