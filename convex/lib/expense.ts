import { v } from 'convex/values';

export const EXPENSE_CATEGORIES = ['rent', 'utilities', 'supplies', 'salary', 'other'] as const;

export const expenseCategoryValidator = v.union(
  v.literal('rent'),
  v.literal('utilities'),
  v.literal('supplies'),
  v.literal('salary'),
  v.literal('other')
);
