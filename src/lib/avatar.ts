/**
 * Default avatar for a user, account, or cashier: a DiceBear "notionists"
 * illustrated avatar deterministically generated from a stable seed (an id), so
 * each person gets a consistent, distinct avatar instead of a plain initial.
 * Used wherever a user/cashier has no uploaded photo. See
 * https://www.dicebear.com/styles/notionists/.
 */
export function defaultAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}`;
}
