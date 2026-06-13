// Pure, dependency-free receipt builders. The printed/emailed receipt content is
// ALWAYS English and kept out of the i18n catalog. No em-dash and no double-hyphen
// anywhere in the generated text/html (use commas, periods, parentheses instead).
//
// These take plain typed inputs that mirror the fields of `orders.getById`
// (the orderDetail shape) and `cafes.myCafe`. No Convex/ctx/client imports.

export interface ReceiptModifier {
  groupName?: string;
  optionName: string;
  priceAdjustmentIDR: number;
}

export interface ReceiptLine {
  nameSnapshot: string;
  qty: number;
  lineTotalIDR: number;
  modifiersSnapshot: ReceiptModifier[];
  variantName?: string;
}

export interface ReceiptPayment {
  method: string;
  amountIDR: number;
}

export interface ReceiptOrder {
  lines: ReceiptLine[];
  subtotalIDR: number;
  discountIDR: number;
  serviceChargeIDR?: number;
  serviceChargeName?: string;
  serviceChargePct?: number;
  taxIDR: number;
  taxRatePct: number;
  totalIDR: number;
  payments: ReceiptPayment[];
  pointsEarned?: number;
  refundedIDR?: number;
  createdAtClient: number;
  cashierName: string;
  orderType?: 'dine_in' | 'takeaway' | 'pickup';
}

export interface ReceiptCafe {
  name: string;
  addressLine?: string;
  phone?: string;
}

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

/** Pure IDR formatter: `Rp ` + thousands separators, no decimals. */
export function formatIDR(n: number): string {
  const sign = n < 0 ? '-' : '';
  const abs = Math.round(Math.abs(n)).toString();
  const grouped = abs.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}Rp ${grouped}`;
}

function paymentLabel(method: string): string {
  return PAYMENT_LABELS[method] ?? method;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-GB');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain-text English receipt. */
export function buildReceiptText(order: ReceiptOrder, cafe: ReceiptCafe | null): string {
  const out: string[] = [];

  if (cafe) {
    out.push(cafe.name);
    if (cafe.addressLine) out.push(cafe.addressLine);
    if (cafe.phone) out.push(cafe.phone);
  }
  out.push(formatDate(order.createdAtClient));
  out.push(`Cashier: ${order.cashierName}`);
  if (order.orderType) out.push(`Order type: ${ORDER_TYPE_LABELS[order.orderType]}`);
  if ((order.refundedIDR ?? 0) > 0) out.push(`REFUNDED ${formatIDR(order.refundedIDR ?? 0)}`);
  out.push('');

  for (const line of order.lines) {
    const variant = line.variantName ? ` (${line.variantName})` : '';
    out.push(`${line.qty}x ${line.nameSnapshot}${variant}   ${formatIDR(line.lineTotalIDR)}`);
    for (const m of line.modifiersSnapshot) {
      out.push(`  + ${m.optionName}`);
    }
  }
  out.push('');

  out.push(`Subtotal   ${formatIDR(order.subtotalIDR)}`);
  if (order.discountIDR > 0) out.push(`Discount   ${formatIDR(-order.discountIDR)}`);
  if ((order.serviceChargeIDR ?? 0) > 0) {
    const name = order.serviceChargeName ?? 'Service';
    const pct = order.serviceChargePct ?? 0;
    out.push(`${name} ${pct}%   ${formatIDR(order.serviceChargeIDR ?? 0)}`);
  }
  if (order.taxIDR > 0) out.push(`Tax ${order.taxRatePct}%   ${formatIDR(order.taxIDR)}`);
  out.push(`Total   ${formatIDR(order.totalIDR)}`);
  out.push('');

  for (const p of order.payments) {
    out.push(`Paid: ${paymentLabel(p.method)}   ${formatIDR(p.amountIDR)}`);
  }
  if (order.pointsEarned !== undefined && order.pointsEarned > 0) {
    out.push(`Points earned: +${order.pointsEarned}`);
  }

  out.push('');
  out.push('Thank you');

  return out.join('\n');
}

/** HTML English receipt (a simple table layout). */
export function buildReceiptHtml(order: ReceiptOrder, cafe: ReceiptCafe | null): string {
  const rows: string[] = [];

  const totalRow = (label: string, value: string, bold = false) => {
    const style = bold ? ' style="font-weight:bold"' : '';
    return `<tr${style}><td>${escapeHtml(label)}</td><td align="right">${escapeHtml(value)}</td></tr>`;
  };

  const head: string[] = [];
  if (cafe) {
    head.push(`<div style="font-weight:bold">${escapeHtml(cafe.name)}</div>`);
    if (cafe.addressLine) head.push(`<div>${escapeHtml(cafe.addressLine)}</div>`);
    if (cafe.phone) head.push(`<div>${escapeHtml(cafe.phone)}</div>`);
  }
  head.push(`<div>${escapeHtml(formatDate(order.createdAtClient))}</div>`);
  head.push(`<div>Cashier: ${escapeHtml(order.cashierName)}</div>`);
  if (order.orderType) {
    head.push(`<div>Order type: ${escapeHtml(ORDER_TYPE_LABELS[order.orderType])}</div>`);
  }
  if ((order.refundedIDR ?? 0) > 0) {
    head.push(
      `<div style="font-weight:bold">REFUNDED ${escapeHtml(formatIDR(order.refundedIDR ?? 0))}</div>`
    );
  }

  for (const line of order.lines) {
    const variant = line.variantName ? ` (${line.variantName})` : '';
    rows.push(totalRow(`${line.qty}x ${line.nameSnapshot}${variant}`, formatIDR(line.lineTotalIDR)));
    for (const m of line.modifiersSnapshot) {
      rows.push(`<tr><td colspan="2">+ ${escapeHtml(m.optionName)}</td></tr>`);
    }
  }

  rows.push(totalRow('Subtotal', formatIDR(order.subtotalIDR)));
  if (order.discountIDR > 0) rows.push(totalRow('Discount', formatIDR(-order.discountIDR)));
  if ((order.serviceChargeIDR ?? 0) > 0) {
    const name = order.serviceChargeName ?? 'Service';
    const pct = order.serviceChargePct ?? 0;
    rows.push(totalRow(`${name} ${pct}%`, formatIDR(order.serviceChargeIDR ?? 0)));
  }
  if (order.taxIDR > 0) rows.push(totalRow(`Tax ${order.taxRatePct}%`, formatIDR(order.taxIDR)));
  rows.push(totalRow('Total', formatIDR(order.totalIDR), true));

  for (const p of order.payments) {
    rows.push(totalRow(`Paid: ${paymentLabel(p.method)}`, formatIDR(p.amountIDR)));
  }
  if (order.pointsEarned !== undefined && order.pointsEarned > 0) {
    rows.push(`<tr><td colspan="2">Points earned: +${order.pointsEarned}</td></tr>`);
  }

  return [
    '<div style="font-family:monospace;max-width:360px">',
    head.join(''),
    '<table cellspacing="0" cellpadding="2" width="100%">',
    rows.join(''),
    '</table>',
    '<div>Thank you</div>',
    '</div>',
  ].join('');
}
