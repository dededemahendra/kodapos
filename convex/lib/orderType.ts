import { v } from 'convex/values';

export const ORDER_TYPES = ['dine_in', 'takeaway', 'pickup'] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const orderTypeValidator = v.union(
  v.literal('dine_in'),
  v.literal('takeaway'),
  v.literal('pickup')
);
