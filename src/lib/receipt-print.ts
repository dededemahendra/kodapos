import type { ReceiptCafe, ReceiptOrder } from 'convex/lib/receipt';
import { formatIDR } from 'convex/lib/receipt';
import { EscPos, divider, twoCol } from './escpos';

// Maps an order to ESC/POS bytes for a thermal printer. Mirrors the English
// content of the emailed/plain-text receipt (always English, off the i18n
// catalog), adding thermal niceties: centered bold header, a bold double-size
// total, paper cut, and an optional cash-drawer pulse.

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Cash',
  qris_static: 'QRIS',
  qris_dynamic: 'QRIS',
  giftcard: 'Gift card',
  card: 'Card',
  ewallet: 'E-Wallet',
  transfer: 'Bank Transfer',
};

const ORDER_TYPE_LABELS: Record<'dine_in' | 'takeaway' | 'pickup', string> = {
  dine_in: 'Dine-in',
  takeaway: 'Takeaway',
  pickup: 'Pickup',
};

export interface ReceiptPrintOptions {
  /** Characters per line: 32 for 58mm paper, 48 for 80mm. */
  widthChars: number;
  /** Printed order reference, e.g. "INV-1A2B". */
  orderNumber?: string;
  /** Print a VOID banner. */
  voided?: boolean;
  /** Pulse the cash drawer at the end. */
  drawerKick?: boolean;
}

export function buildReceiptBytes(
  order: ReceiptOrder,
  cafe: ReceiptCafe | null,
  opts: ReceiptPrintOptions
): Uint8Array {
  const w = opts.widthChars;
  const p = new EscPos();
  p.init();

  // Header (centered).
  p.align('center');
  if (cafe) {
    p.bold(true).doubleSize(true).line(cafe.name).doubleSize(false).bold(false);
    if (cafe.addressLine) p.line(cafe.addressLine);
    if (cafe.phone) p.line(cafe.phone);
  }
  p.line(new Date(order.createdAtClient).toLocaleString('en-GB'));
  p.line(`Cashier: ${order.cashierName}`);
  if (opts.orderNumber) p.line(`Order #${opts.orderNumber}`);
  if (order.orderType) p.line(`Order type: ${ORDER_TYPE_LABELS[order.orderType]}`);
  if (opts.voided) p.bold(true).line('** VOID **').bold(false);
  if ((order.refundedIDR ?? 0) > 0) p.line(`REFUNDED ${formatIDR(order.refundedIDR ?? 0)}`);

  // Items (left).
  p.align('left');
  p.line(divider(w));
  for (const line of order.lines) {
    const variant = line.variantName ? ` (${line.variantName})` : '';
    p.line(twoCol(`${line.qty}x ${line.nameSnapshot}${variant}`, formatIDR(line.lineTotalIDR), w));
    for (const m of line.modifiersSnapshot) {
      p.line(`  + ${m.optionName}`);
    }
  }
  p.line(divider(w));

  // Totals.
  p.line(twoCol('Subtotal', formatIDR(order.subtotalIDR), w));
  if (order.discountIDR > 0) p.line(twoCol('Discount', formatIDR(-order.discountIDR), w));
  if ((order.serviceChargeIDR ?? 0) > 0) {
    const name = order.serviceChargeName ?? 'Service';
    p.line(twoCol(`${name} ${order.serviceChargePct ?? 0}%`, formatIDR(order.serviceChargeIDR ?? 0), w));
  }
  if (order.taxIDR > 0) p.line(twoCol(`Tax ${order.taxRatePct}%`, formatIDR(order.taxIDR), w));
  p.bold(true).line(twoCol('TOTAL', formatIDR(order.totalIDR), w)).bold(false);
  p.line(divider(w));

  // Payments.
  for (const pay of order.payments) {
    p.line(twoCol(`Paid: ${PAYMENT_LABELS[pay.method] ?? pay.method}`, formatIDR(pay.amountIDR), w));
  }
  if (order.pointsEarned !== undefined && order.pointsEarned > 0) {
    p.line(`Points earned: +${order.pointsEarned}`);
  }

  // Footer.
  p.align('center').feed(1).line('Thank you').feed(3);
  p.cut();
  if (opts.drawerKick) p.drawerKick();

  return p.encode();
}
