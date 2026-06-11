# Professional POS Roadmap

**Created:** 2026-06-11
**Mode:** Autonomous build — each slice runs spec → plan → subagent build → local CI
(typecheck/test/lingui) → CodeRabbit → merge commit, then the next. No pause between
slices; quality gates kept. Payment-touching slices get extra review scrutiny.

## Already shipped (do NOT rebuild)

Sale (cash, QRIS static, QRIS dynamic/Xendit BYO), modifiers, promos, loyalty
earn/redeem, receipts (+config), menu + categories + item images, recipes + COGS,
inventory (stock, adjustments, waste, purchases, suppliers, restock suggestions,
movement history, **stock health overview**), shifts (open/close/reconcile, cash
movements, history), **cashier handoff + `cashierSessions` audit**, **UI permission
gating**, dashboard/forecast, reports (sales/products/payments/orders/cashiers),
customers/CRM, settings (profile/tax/payment/receipt/staff/integrations).

## Build queue (priority order)

1. **Stock take (bulk recount)** — `inventory`. Batched `performStockTake` mutation +
   multi-row count form. [in progress]
2. **Order types** — dine-in / takeaway / pickup flag on orders; surfaced at checkout,
   on receipt, and as an order-history filter. S.
3. **Held / parked orders (open tabs)** — save a cart without payment, resume/settle
   later in the shift. `orders.status: draft|held` (or a `heldOrders` store). M.
4. **Refunds / returns + void UI** — reverse a paid order (full first; partial later);
   restore inventory; reverse loyalty. Gated by `canVoid`. M.
5. **Split / multi-tender payments** — multiple tenders settle one order (e.g. cash +
   QRIS). Payments become 1:N. M. (extra review — money path)
6. **Tips / gratuity** — optional tip captured at/after payment; on order + receipt. S.
7. **Line-item & manager order discounts** — per-line discount + a manager override
   discount line, gated by `canDiscount`. S/M.
8. **Receipt reprint** — reprint any historical order from order history. S.
9. **Expense tracking** — record non-inventory expenses by category; surfaced in
   reporting. M.
10. **Item profitability / margin report** — gross margin % per item from price vs
    recipe COGS. M.

## Deferred — need product direction before building (surface, don't auto-build)

Table management & floor plan; Kitchen Display System (KDS); offline-first resilience;
multi-outlet / stock transfer; third-party delivery (Grab/Gojek/Shopeefood); gift
cards/vouchers; product variant matrix; loyalty tiers; rich promo conditions; employee
time clock; barcode scanning (needs hardware assumptions); customer-facing display.

These are larger and/or depend on business model choices (hardware, # outlets, dine-in
vs grab-and-go). I'll stop and ask before committing to them.
