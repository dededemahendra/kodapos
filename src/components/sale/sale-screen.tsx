import { Trans, useLingui } from '@lingui/react/macro';
import { useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import {
  computeOrderTotals,
  DEFAULT_SERVICE_CHARGE_NAME,
  promoDiscountIDR,
  scopedSubtotalIDR,
} from 'convex/lib/pricing';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useEffect, useReducer, useRef, useState } from 'react';
import { GiftCardPaymentDialog } from '~/components/giftcard/gift-card-payment-dialog';
import { CashMovementDialog } from '~/components/shift/cash-movement-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { useActiveCashier } from '~/lib/active-cashier';
import { publishDisplay } from '~/lib/customer-display';
import { useBoolPreference } from '~/lib/preferences';
import { scanBeep } from '~/lib/scan-feedback';
import { playSaleChime } from '~/lib/sound';
import { toast } from '~/lib/toast';
import { CartPane } from './cart-pane';
import { type CartState, cartReducer, initialCart, type RepriceMap } from './cart-reducer';
import { CashPaymentDialog } from './cash-payment-dialog';
import { HeldOrdersDialog } from './held-orders-dialog';
import { HoldOrderDialog } from './hold-order-dialog';
import { ManualDiscountDialog } from './manual-discount-dialog';
import { type ItemForSale, MenuPane } from './menu-pane';
import { ModifierPickerDialog } from './modifier-picker-dialog';
import { PAYMENT_METHODS, type PaymentMethod } from './payment-methods';
import { PromoPickerDialog } from './promo-picker-dialog';
import { QrisDynamicPaymentDialog } from './qris-dynamic-payment-dialog';
import { QrisStaticPaymentDialog } from './qris-static-payment-dialog';
import { ReceiptPreview } from './receipt-preview';
import { SaleScreenSkeleton } from './sale-screen-skeleton';
import { SplitPaymentDialog } from './split-payment-dialog';

function genLineKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SaleScreen({
  recall,
  selfOrder,
  table,
}: {
  recall?: string | undefined;
  selfOrder?: string | undefined;
  table?: string | undefined;
} = {}) {
  const { t } = useLingui();
  const navigate = useNavigate();
  const convex = useConvex();
  const removeHeld = useMutation(api.heldOrders.remove);
  const acceptSelfOrder = useMutation(api.selfOrders.accept);
  const categories = useQuery(api.menu.categories.list, {});
  const priceCategories = useQuery(api.menu.priceCategories.list, {});
  // The tier applies to one order only: it always starts (and, after a
  // completed sale, returns to) Standard. Making it sticky across sales is an
  // obvious future ask, but it would silently charge the NEXT customer the
  // previous customer's tier, which is this feature's main operational risk.
  const [priceCategoryId, setPriceCategoryId] = useState<Id<'priceCategories'> | null>(null);
  const items = useQuery(api.menu.items.listForSale, priceCategoryId ? { priceCategoryId } : {});
  // Switching tier changes this query's args, so Convex briefly resolves
  // `items` to undefined mid-refetch. Cache the last resolved value so the
  // tiles and cart the customer is looking at don't blank out while the new
  // tier's prices load; `pricesReady` (below) still tracks the LIVE value so
  // payment stays gated until the fresh prices are actually in.
  const lastItemsRef = useRef<typeof items>(undefined);
  if (items !== undefined) lastItemsRef.current = items;
  const displayItems = items ?? lastItemsRef.current;
  const cafe = useQuery(api.cafes.myCafe, {});
  const shift = useQuery(api.shifts.current, {});
  const settings = useQuery(api.settings.get, {});
  const { cashierId } = useActiveCashier();
  const [confirmClearCart] = useBoolPreference('confirmClearCart', true);
  const [saleSound] = useBoolPreference('saleSound', false);
  const [printAuto] = useBoolPreference('printAuto', false);
  const [cart, dispatch] = useReducer(cartReducer, initialCart);
  // Phone-only: which pane the tab bar shows. Ignored at md+ where both render.
  const [mobileView, setMobileView] = useState<'menu' | 'order'>('menu');
  const [clearOpen, setClearOpen] = useState(false);
  const [pickerRow, setPickerRow] = useState<ItemForSale | null>(null);
  const [scanFlash, setScanFlash] = useState<'hit' | 'miss' | null>(null);
  const [openMethod, setOpenMethod] = useState<PaymentMethod | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
  const [giftCardOpen, setGiftCardOpen] = useState(false);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
  const [manualDiscountOpen, setManualDiscountOpen] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState<Id<'orders'> | null>(null);
  const [kasOpen, setKasOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [heldOpen, setHeldOpen] = useState(false);
  const [recallTarget, setRecallTarget] = useState<CartState | null>(null);
  // The table this sale is tagged to (from /sale?table=<id> on the floor, or
  // re-derived when resuming a parked table order). Cleared once a sale settles.
  const [currentTable, setCurrentTable] = useState<Id<'tables'> | null>(
    table ? (table as Id<'tables'>) : null
  );
  const held = useQuery(api.heldOrders.listForShift, shift ? { shiftId: shift._id } : 'skip');

  // Every payment dialog settles the same way: show the receipt, empty the cart,
  // and untag the table. Centralised so the success chime (opt-in via Settings →
  // Notifikasi → "Suara saat transaksi berhasil") plays once on any method.
  function handlePaid(orderId: Id<'orders'>): void {
    if (saleSound) playSaleChime();
    setReceiptOrderId(orderId);
    dispatch({ type: 'clearCart' });
    setCurrentTable(null);
    // The price category applies to this one order only, so it resets to
    // Standard right alongside the cart. Making it sticky would be one tap
    // less per sale, but it would also silently charge the next customer
    // whatever tier the last one was rung on.
    setPriceCategoryId(null);
  }
  // Accept a QR self-order into the register: /sale?selfOrder=<selfOrderId>.
  // The payload is the SAME held-order recall shape, so it loads identically.
  const selfOrderCart = useQuery(
    api.selfOrders.getForCart,
    selfOrder ? { id: selfOrder as Id<'selfOrders'> } : 'skip'
  );

  // Resume a table's parked order from the floor: /sale?recall=<heldOrderId>.
  // The ref guards the effect so it fires once per recall id (not on every
  // re-render while we await the remove + navigate).
  const recalledRef = useRef<string | null>(null);
  useEffect(() => {
    if (!recall || held === undefined) return;
    if (recalledRef.current === recall) return;
    recalledRef.current = recall;
    const row = held.find((h) => h._id === recall);
    void (async () => {
      if (row) {
        const state: CartState = {
          orderType: row.orderType,
          promo: row.promo
            ? {
                _id: row.promo.promoId,
                name: row.promo.name,
                type: row.promo.type,
                value: row.promo.value,
                ...(row.promo.scope ? { scope: row.promo.scope } : {}),
                ...(row.promo.targetItemIds ? { targetItemIds: row.promo.targetItemIds } : {}),
                ...(row.promo.targetCategoryIds
                  ? { targetCategoryIds: row.promo.targetCategoryIds }
                  : {}),
              }
            : null,
          lines: row.lines.map((l) => ({ ...l, lineKey: genLineKey() })),
          manualDiscount: null,
        };
        dispatch({ type: 'load', state });
        // A held order's lines display the unitPriceIDR they were parked at,
        // but buildOrder recomputes every line from scratch at checkout using
        // whatever priceCategoryId the register currently has selected. If a
        // leftover tier from the PREVIOUS customer were still active, this
        // recalled cart would display the held prices while the till charges
        // the leftover tier's prices instead: quoting one number and taking
        // another, which is exactly the failure this feature exists to
        // prevent. Reset to Standard so the reprice effect refetches Standard
        // prices and the display matches the charge again.
        setPriceCategoryId(null);
        // Re-tag the resumed order to its table so the next sale carries it.
        if (row.tableId) setCurrentTable(row.tableId);
        await removeHeld({ id: recall as Id<'heldOrders'> });
      }
      // Clear the param whether the row was found or already gone.
      await navigate({ to: '/sale', search: {}, replace: true });
    })();
  }, [recall, held, navigate, removeHeld]);

  // Accept a self-order from the "Pesanan Masuk" queue. Mirrors the recall flow:
  // load the same recall-shaped lines into the cart, re-tag the table, mark the
  // self-order accepted, then strip the param. The ref guards a single run per id.
  const acceptedSelfOrderRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selfOrder || selfOrderCart === undefined) return;
    if (acceptedSelfOrderRef.current === selfOrder) return;
    acceptedSelfOrderRef.current = selfOrder;
    void (async () => {
      const state: CartState = {
        orderType: 'dine_in',
        promo: null,
        lines: selfOrderCart.lines.map((l) => ({ ...l, lineKey: genLineKey() })),
        manualDiscount: null,
      };
      dispatch({ type: 'load', state });
      // Same reasoning as the held-order recall above: this cart's lines
      // display the self-order's own prices, but the till charges from
      // whatever priceCategoryId is currently selected, not what the cart is
      // showing. Reset to Standard so the two agree again.
      setPriceCategoryId(null);
      if (selfOrderCart.tableId) setCurrentTable(selfOrderCart.tableId);
      await acceptSelfOrder({ id: selfOrder as Id<'selfOrders'> });
      await navigate({ to: '/sale', search: {}, replace: true });
    })();
  }, [selfOrder, selfOrderCart, navigate, acceptSelfOrder]);

  // Reprice the cart whenever the selected tier (or the menu data itself)
  // changes, built from the SAME listForSale result the tiles render from so
  // the screen and the cart can never disagree. Never clears the cart: a tier
  // switch usually happens with a customer already standing at the till.
  useEffect(() => {
    if (items === undefined) return;
    const prices: RepriceMap = { items: {}, variants: {}, modifiers: {} };
    for (const row of items) {
      prices.items[row.item._id] = row.item.priceIDR;
      for (const v of row.variants) prices.variants[v._id] = v.priceIDR;
      for (const g of row.attachedGroups) {
        for (const o of g.options) prices.modifiers[o._id] = o.priceAdjustmentIDR;
      }
    }
    dispatch({ type: 'reprice', prices });
  }, [items, priceCategoryId]);

  // If the selected tier gets archived mid-sale, `priceCategories.list` stops
  // returning it while `priceCategoryId` still points at it, and `listForSale`
  // throws for an archived id. Fall back to Standard rather than let that
  // throw take the whole register to an error boundary. Guarded on
  // `priceCategories !== undefined` so a normal refetch never wipes the
  // selection while the list is momentarily loading.
  useEffect(() => {
    if (!priceCategoryId || priceCategories === undefined) return;
    if (!priceCategories.some((c) => c._id === priceCategoryId)) {
      setPriceCategoryId(null);
    }
  }, [priceCategoryId, priceCategories]);

  const subtotal = cart.lines.reduce((s, l) => s + l.qty * l.unitPriceIDR, 0);
  // Map each cart line to the scope-helper shape, resolving its category from the
  // loaded items so a scoped promo previews against only its matching lines. The
  // server recomputes the discount authoritatively from the promo doc at checkout.
  const scopeLines = cart.lines.map((l) => ({
    menuItemId: l.menuItemId as string,
    categoryId: (displayItems?.find((r) => r.item._id === l.menuItemId)?.item.categoryId ??
      '') as string,
    lineTotalIDR: l.qty * l.unitPriceIDR,
  }));
  const promoDisc = cart.promo
    ? promoDiscountIDR(
        cart.promo.type,
        cart.promo.value,
        scopedSubtotalIDR(
          scopeLines,
          cart.promo.scope,
          cart.promo.targetItemIds,
          cart.promo.targetCategoryIds
        )
      )
    : 0;
  const manualDisc = cart.manualDiscount
    ? promoDiscountIDR(cart.manualDiscount.type, cart.manualDiscount.value, subtotal - promoDisc)
    : 0;
  const discount = promoDisc + manualDisc;
  const taxEnabled = cafe?.taxEnabled === true;
  const taxRatePct = taxEnabled ? (cafe?.taxRatePct ?? 0) : 0;
  const scEnabled = settings?.payment.serviceChargeEnabled === true;
  const scPct = scEnabled ? (settings?.payment.serviceChargePct ?? 0) : 0;
  const scName = settings?.payment.serviceChargeName ?? DEFAULT_SERVICE_CHARGE_NAME;
  const {
    serviceChargeIDR,
    taxIDR: tax,
    totalIDR: total,
  } = computeOrderTotals({
    subtotalIDR: subtotal,
    discountIDR: discount,
    serviceChargeEnabled: scEnabled,
    serviceChargePct: scPct,
    taxEnabled,
    taxRatePct,
  });

  // Mirror the live cart to the customer-facing /display window via localStorage.
  // Publish a snapshot whenever the lines or totals change; publish null when the
  // cart is empty so the display falls back to its idle welcome state.
  useEffect(() => {
    if (cart.lines.length === 0) {
      publishDisplay(null);
      return;
    }
    publishDisplay({
      lines: cart.lines.map((l) => ({
        name: l.nameSnapshot,
        ...(l.variantName ? { variantName: l.variantName } : {}),
        qty: l.qty,
        lineTotalIDR: l.qty * l.unitPriceIDR,
      })),
      subtotalIDR: subtotal,
      discountIDR: discount,
      serviceChargeIDR,
      taxIDR: tax,
      totalIDR: total,
      ...(cart.promo ? { promoName: cart.promo.name } : {}),
    });
  }, [subtotal, discount, serviceChargeIDR, tax, total, cart.lines, cart.promo]);

  // Clear the display when the register window closes so a stale cart does not
  // linger on the second monitor.
  useEffect(() => () => publishDisplay(null), []);

  // The full-screen skeleton is only for the very first load. Once every gated
  // query has resolved at least once, a later refetch (a tier switch re-runs
  // listForSale with new args) must NOT blank the whole register out from under
  // a cashier mid-sale: keep showing the last-known data (displayItems above)
  // instead. `items` itself, not displayItems, still decides whether all the
  // gates have been satisfied, so a tier switch after the first load never
  // re-triggers this branch.
  const hasLoadedOnce = useRef(false);
  if (
    categories !== undefined &&
    items !== undefined &&
    cafe !== undefined &&
    shift !== undefined &&
    settings !== undefined
  ) {
    hasLoadedOnce.current = true;
  }
  if (
    !hasLoadedOnce.current ||
    categories === undefined ||
    displayItems === undefined ||
    cafe === undefined ||
    shift === undefined ||
    settings === undefined
  ) {
    return <SaleScreenSkeleton />;
  }
  // The LIVE query, not the cached displayItems: a payment must never be
  // confirmed against stale prices while the new tier's listForSale round trip
  // is still in flight, since buildOrder always resolves the charge from the
  // CURRENT priceCategoryId server-side. Gates opening a payment dialog (below)
  // and forces one closed if a refetch starts while it's already open.
  const pricesReady = items !== undefined;

  const defaultMethod = settings.payment.defaultMethod;
  const ready = PAYMENT_METHODS.filter((m) => m.isReady(settings)).map((m) => m.method);
  // Sync tender methods a split can combine. Mirror the same gating the cash /
  // qris_static dialogs use: cash if enabled, qris_static if enabled + QR set.
  const splitCashEnabled = ready.includes('cash');
  const splitQrisStaticEnabled = ready.includes('qris_static');
  // A split needs at least two usable sync methods to be meaningful.
  const canSplit = splitCashEnabled && splitQrisStaticEnabled;
  // Dynamic QRIS supersedes static on the same rail: it auto-confirms via webhook
  // and is strictly preferable, so never show two identical "QRIS" buttons.
  const supported = ready.includes('qris_dynamic')
    ? ready.filter((m) => m !== 'qris_static')
    : ready;
  // Put the configured default first when it is in the supported set. Sort on a
  // boolean key so the comparator stays a valid total order as methods are added.
  const payMethods = [...supported].sort(
    (a, b) => Number(b === defaultMethod) - Number(a === defaultMethod)
  );

  // Add a specific variant straight to the cart, mirroring the picker's line
  // shape. If the parent item has modifier groups that need a choice, defer to
  // the picker (pre-selected variant) so required modifiers are never skipped.
  function addVariantLine(row: ItemForSale, variantId: Id<'menuItemVariants'>) {
    const variant = row.variants.find((vr) => vr._id === variantId);
    if (!variant) return;
    if (row.attachedGroups.length > 0) {
      setPickerRow(row);
      return;
    }
    dispatch({
      type: 'addLine',
      lineKey: genLineKey(),
      line: {
        menuItemId: row.item._id,
        nameSnapshot: row.item.name,
        variantId: variant._id,
        variantName: variant.name,
        qty: 1,
        unitPriceIDR: variant.priceIDR,
        modifierOptionIds: [],
        modifierLabels: [],
      },
    });
  }

  function flash(kind: 'hit' | 'miss') {
    scanBeep(kind);
    setScanFlash(kind);
    window.setTimeout(() => setScanFlash(null), 300);
  }

  async function onScan(code: string) {
    // 1) In-memory: item barcode.
    const itemRow = displayItems?.find((r) => r.item.barcode === code);
    if (itemRow) {
      flash('hit');
      onItemTap(itemRow);
      return;
    }
    // 2) In-memory: variant barcode.
    for (const r of displayItems ?? []) {
      const variant = r.variants.find((vr) => vr.barcode === code);
      if (variant) {
        flash('hit');
        addVariantLine(r, variant._id);
        return;
      }
    }
    // 3) Backend fallback for products not in the loaded set.
    try {
      const hit = await convex.query(api.menu.items.getByBarcode, { barcode: code });
      if (hit) {
        const row = displayItems?.find((r) => r.item._id === hit.itemId);
        if (row) {
          flash('hit');
          if (hit.kind === 'variant') addVariantLine(row, hit.variantId);
          else onItemTap(row);
          return;
        }
      }
    } catch {
      // Query failed (e.g. no active outlet): fall through to the miss path
      // so the operator still gets a clear signal.
    }
    // 4) Miss.
    flash('miss');
    toast.error(t`Barcode tidak ditemukan.`);
  }

  function onItemTap(row: ItemForSale) {
    if (row.item.soldOut) {
      toast.error(t`Item sedang habis.`);
      return;
    }
    if (row.variants.length > 0 || row.attachedGroups.length > 0) {
      setPickerRow(row);
      return;
    }
    dispatch({
      type: 'addLine',
      lineKey: genLineKey(),
      line: {
        menuItemId: row.item._id,
        nameSnapshot: row.item.name,
        qty: 1,
        unitPriceIDR: row.item.priceIDR,
        modifierOptionIds: [],
        modifierLabels: [],
      },
    });
  }

  // Hide the picker entirely when the cafe has never created a price
  // category: a cafe that never opted in must see no new control at all.
  const hasPriceCategories = priceCategories !== undefined && priceCategories.length > 0;
  const activePriceCategory = priceCategoryId
    ? (priceCategories?.find((c) => c._id === priceCategoryId) ?? null)
    : null;
  const standardLabel = cafe?.standardPriceLabel || t`Standar`;

  return (
    <div
      className={`flex flex-col h-full min-h-0 overflow-hidden md:grid md:grid-cols-[minmax(0,1fr)_320px] lg:grid-cols-[minmax(0,1fr)_380px] ${
        hasPriceCategories ? 'md:grid-rows-[auto_1fr]' : ''
      }`}
    >
      {/* Phone-only tab bar: the menu and cart can't sit side by side under md,
          so they swap full-width here. Hidden on tablet+ where the grid shows
          both. The count keeps the cart discoverable after adding items. */}
      <div className="flex gap-1 border-b border-border p-2 md:hidden">
        <button
          type="button"
          onClick={() => setMobileView('menu')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            mobileView === 'menu'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Trans>Menu</Trans>
        </button>
        <button
          type="button"
          onClick={() => setMobileView('order')}
          className={`flex-1 rounded-md py-2 text-sm font-medium ${
            mobileView === 'order'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          <Trans>Pesanan ({cart.lines.length})</Trans>
        </button>
      </div>
      {hasPriceCategories ? (
        <div
          className={`flex flex-wrap items-center gap-2 border-b px-3 py-2 md:col-span-2 ${
            activePriceCategory
              ? 'border-amber-300 bg-amber-100 text-amber-900'
              : 'border-border bg-background'
          }`}
        >
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Trans>Kategori harga</Trans>
          </span>
          <Select
            value={priceCategoryId ?? 'standard'}
            onValueChange={(v) =>
              setPriceCategoryId(v === 'standard' ? null : (v as Id<'priceCategories'>))
            }
          >
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">{standardLabel}</SelectItem>
              {priceCategories?.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activePriceCategory ? (
            <span className="ml-auto text-sm font-semibold">
              <Trans>Harga aktif: {activePriceCategory.name}</Trans>
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        className={`min-w-0 min-h-0 flex-1 flex-col md:flex ${
          mobileView === 'menu' ? 'flex' : 'hidden'
        }`}
      >
        <MenuPane
          categories={categories}
          items={displayItems}
          onItemTap={onItemTap}
          onScan={onScan}
          scanFlash={scanFlash}
        />
      </div>
      <div
        className={`min-w-0 min-h-0 flex-1 flex-col md:flex ${
          mobileView === 'order' ? 'flex' : 'hidden'
        }`}
      >
        <CartPane
          cart={cart}
          dispatch={dispatch}
          subtotalIDR={subtotal}
          serviceChargeIDR={serviceChargeIDR}
          serviceChargeName={scName}
          serviceChargePct={scPct}
          taxEnabled={taxEnabled}
          taxRatePct={taxRatePct}
          taxIDR={tax}
          totalIDR={total}
          promo={cart.promo}
          discountIDR={discount}
          onAddPromo={() => setPromoPickerOpen(true)}
          onRemovePromo={() => dispatch({ type: 'setPromo', promo: null })}
          manualDiscount={cart.manualDiscount}
          onAddManualDiscount={() => setManualDiscountOpen(true)}
          onRemoveManualDiscount={() =>
            dispatch({ type: 'setManualDiscount', manualDiscount: null })
          }
          payMethods={payMethods}
          onPay={(method) => {
            // pricesReady also gates the dialog's `open` prop below, but check it
            // here too so a tap during a tier-switch refetch never opens a
            // payment dialog against prices that are about to change under it.
            if (cart.lines.length > 0 && pricesReady) setOpenMethod(method);
          }}
          {...(shift && cashierId && canSplit
            ? {
                onSplit: () => {
                  if (cart.lines.length > 0 && pricesReady) setSplitOpen(true);
                },
              }
            : {})}
          {...(shift && cashierId
            ? {
                onGiftCard: () => {
                  if (cart.lines.length > 0 && pricesReady) setGiftCardOpen(true);
                },
              }
            : {})}
          onKosongkan={() => {
            if (confirmClearCart) setClearOpen(true);
            else {
              dispatch({ type: 'clearCart' });
              // A tier applies to ONE order only: clearing the cart abandons
              // that order, so the selected tier must not carry over to the next.
              setPriceCategoryId(null);
            }
          }}
          {...(shift && cashierId
            ? {
                onKas: () => setKasOpen(true),
                onSwitch: true,
                onHold: () => setHoldOpen(true),
                onShowHeld: () => setHeldOpen(true),
                heldCount: held?.length ?? 0,
              }
            : {})}
        />
      </div>
      <ModifierPickerDialog
        open={pickerRow !== null}
        onOpenChange={(open) => {
          if (!open) setPickerRow(null);
        }}
        row={pickerRow}
        onConfirm={(pick) => {
          if (!pickerRow) return;
          dispatch({
            type: 'addLine',
            lineKey: genLineKey(),
            line: {
              menuItemId: pickerRow.item._id,
              nameSnapshot: pickerRow.item.name,
              ...(pick.variantId
                ? { variantId: pick.variantId, variantName: pick.variantName }
                : {}),
              qty: pick.qty,
              unitPriceIDR: pick.unitPriceIDR,
              modifierOptionIds: pick.modifierOptionIds,
              modifierLabels: pick.modifierLabels,
            },
          });
          setPickerRow(null);
        }}
      />
      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Kosongkan keranjang?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>Semua item akan dihapus dari pesanan ini.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Batal</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch({ type: 'clearCart' });
                setPriceCategoryId(null);
                setClearOpen(false);
              }}
            >
              <Trans>Kosongkan</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={recallTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRecallTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Ganti keranjang saat ini?</Trans>
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans>Keranjang berisi item. Memuat pesanan ditahan akan menggantinya.</Trans>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Batal</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recallTarget) {
                  dispatch({ type: 'load', state: recallTarget });
                  // See the held-order recall effect above: a recalled cart's
                  // displayed prices and the till's charged prices only agree
                  // when the tier is reset to Standard here too.
                  setPriceCategoryId(null);
                }
                setRecallTarget(null);
              }}
            >
              <Trans>Muat</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {shift && cashierId ? (
        <>
          <CashMovementDialog open={kasOpen} onOpenChange={setKasOpen} shiftId={shift._id} />
          <HoldOrderDialog
            open={holdOpen}
            cart={cart}
            cashierId={cashierId}
            {...(table ? { defaultTableId: table as Id<'tables'> } : {})}
            onOpenChange={setHoldOpen}
            onHeld={() => {
              dispatch({ type: 'clearCart' });
              setPriceCategoryId(null);
              setHoldOpen(false);
            }}
          />
          <HeldOrdersDialog
            open={heldOpen}
            held={held}
            genLineKey={genLineKey}
            onOpenChange={setHeldOpen}
            onRecall={(state) => {
              if (cart.lines.length > 0) {
                setRecallTarget(state);
              } else {
                dispatch({ type: 'load', state });
                // Same reset as the "Muat" confirmation below: without it, a
                // leftover tier would silently charge this recalled order.
                setPriceCategoryId(null);
              }
            }}
          />
          <CashPaymentDialog
            open={openMethod === 'cash' && pricesReady}
            onOpenChange={(o) => {
              if (!o) setOpenMethod(null);
            }}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            quickCashButtons={settings.payment.quickCashButtons}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            {...(currentTable ? { tableId: currentTable } : {})}
            {...(priceCategoryId ? { priceCategoryId } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={handlePaid}
          />
          <QrisStaticPaymentDialog
            open={openMethod === 'qris_static' && pricesReady}
            onOpenChange={(o) => {
              if (!o) setOpenMethod(null);
            }}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            {...(settings.qrisImageUrl ? { qrisImageUrl: settings.qrisImageUrl } : {})}
            {...('qrisMerchantName' in settings.payment && settings.payment.qrisMerchantName
              ? { qrisMerchantName: settings.payment.qrisMerchantName }
              : {})}
            {...('qrisNmid' in settings.payment && settings.payment.qrisNmid
              ? { qrisNmid: settings.payment.qrisNmid }
              : {})}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            {...(currentTable ? { tableId: currentTable } : {})}
            {...(priceCategoryId ? { priceCategoryId } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={handlePaid}
          />
          <SplitPaymentDialog
            open={splitOpen && pricesReady}
            onOpenChange={setSplitOpen}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            cashEnabled={splitCashEnabled}
            qrisStaticEnabled={splitQrisStaticEnabled}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            {...(currentTable ? { tableId: currentTable } : {})}
            {...(priceCategoryId ? { priceCategoryId } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={handlePaid}
          />
          <GiftCardPaymentDialog
            open={giftCardOpen && pricesReady}
            onOpenChange={setGiftCardOpen}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            {...(currentTable ? { tableId: currentTable } : {})}
            {...(priceCategoryId ? { priceCategoryId } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={handlePaid}
          />
          <QrisDynamicPaymentDialog
            open={openMethod === 'qris_dynamic' && pricesReady}
            onOpenChange={(o) => {
              if (!o) setOpenMethod(null);
            }}
            subtotalIDR={subtotal}
            promoDiscountIDR={discount}
            serviceChargeEnabled={scEnabled}
            serviceChargePct={scPct}
            taxEnabled={taxEnabled}
            taxRatePct={taxRatePct}
            {...(cart.promo?._id ? { promoId: cart.promo._id } : {})}
            {...(currentTable ? { tableId: currentTable } : {})}
            {...(priceCategoryId ? { priceCategoryId } : {})}
            cart={cart}
            shiftId={shift._id}
            cashierId={cashierId}
            onPaid={handlePaid}
          />
        </>
      ) : null}
      <ReceiptPreview
        open={receiptOrderId !== null}
        onOpenChange={(open) => {
          if (!open) setReceiptOrderId(null);
        }}
        orderId={receiptOrderId}
        onDone={() => setReceiptOrderId(null)}
        autoPrint={printAuto}
      />
      <PromoPickerDialog
        open={promoPickerOpen}
        onOpenChange={setPromoPickerOpen}
        onSelect={(promo) => dispatch({ type: 'setPromo', promo })}
      />
      <ManualDiscountDialog
        open={manualDiscountOpen}
        current={cart.manualDiscount}
        onOpenChange={setManualDiscountOpen}
        onApply={(d) => dispatch({ type: 'setManualDiscount', manualDiscount: d })}
        onRemove={() => dispatch({ type: 'setManualDiscount', manualDiscount: null })}
      />
    </div>
  );
}
