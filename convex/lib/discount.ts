import { v } from 'convex/values';

export const manualDiscountValidator = v.object({
  type: v.union(v.literal('percent'), v.literal('fixed')),
  value: v.number(),
});
