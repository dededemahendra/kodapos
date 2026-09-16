/**
 * Receipt number for a sale rung offline.
 *
 * Online receipts derive their number from the Convex document id
 * (`receipt-preview.tsx`), which does not exist until the server inserts. The
 * `clientId` is the only stable identifier the till has at print time, so
 * offline receipts use its last four characters. Two schemes therefore
 * coexist; switching all orders to clientId-derived numbers would change the
 * printed number of every historical order, so a reprint would no longer match
 * the receipt the customer was originally handed.
 */
export function offlineReceiptNumber(prefix: string, clientId: string): string {
  return `${prefix}${clientId.slice(-4).toUpperCase()}`;
}
