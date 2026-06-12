import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { formatIDR } from '~/lib/money';
import { usePermissions } from '~/lib/permissions';
import { formatPromoValue } from '~/lib/promo';
import type { CartAction, CartPromo, CartState, ManualDiscount } from './cart-reducer';
import { CartLineRow } from './cart-line-row';
import { ORDER_TYPE_OPTIONS } from './order-types';
import { methodLabel, type PaymentMethod } from './payment-methods';

export function CartPane({
  cart,
  dispatch,
  subtotalIDR,
  serviceChargeIDR,
  serviceChargeName,
  serviceChargePct,
  taxEnabled,
  taxRatePct,
  taxIDR,
  totalIDR,
  promo,
  discountIDR,
  onAddPromo,
  onRemovePromo,
  manualDiscount,
  onAddManualDiscount,
  onRemoveManualDiscount,
  payMethods,
  onPay,
  onKosongkan,
  onKas,
  onSwitch,
  onHold,
  onShowHeld,
  heldCount,
}: {
  cart: CartState;
  dispatch: (a: CartAction) => void;
  subtotalIDR: number;
  serviceChargeIDR: number;
  serviceChargeName: string;
  serviceChargePct: number;
  taxEnabled: boolean;
  taxRatePct: number;
  taxIDR: number;
  totalIDR: number;
  promo: CartPromo | null;
  discountIDR: number;
  onAddPromo: () => void;
  onRemovePromo: () => void;
  manualDiscount?: ManualDiscount | null;
  onAddManualDiscount?: () => void;
  onRemoveManualDiscount?: () => void;
  payMethods: PaymentMethod[];
  onPay: (method: PaymentMethod) => void;
  onKosongkan: () => void;
  onKas?: () => void;
  onSwitch?: boolean;
  onHold?: () => void;
  onShowHeld?: () => void;
  heldCount?: number;
}) {
  const { t } = useLingui();
  const { can } = usePermissions();
  const empty = cart.lines.length === 0;

  return (
    <aside className="border-l border-border flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            <Trans>Pesanan ({cart.lines.length})</Trans>
          </h2>
          <div className="flex items-center gap-1">
            {onSwitch ? (
              <Button type="button" size="sm" variant="outline" asChild>
                <Link to="/pin"><Trans>Ganti kasir</Trans></Link>
              </Button>
            ) : null}
            {onKas ? (
              <Button type="button" size="sm" variant="outline" onClick={onKas}>
                <Trans>Kas</Trans>
              </Button>
            ) : null}
            {onShowHeld ? (
              <Button type="button" size="sm" variant="outline" onClick={onShowHeld}>
                <Trans>Ditahan ({heldCount ?? 0})</Trans>
              </Button>
            ) : null}
            {onHold ? (
              <Button type="button" size="sm" variant="outline" onClick={onHold} disabled={empty}>
                <Trans>Tahan</Trans>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onKosongkan}
              disabled={empty}
              className="text-muted-foreground"
            >
              <Trans>Kosongkan</Trans>
            </Button>
          </div>
        </div>
        <div className="mt-2 flex gap-1">
          {ORDER_TYPE_OPTIONS.map((o) => (
            <Button
              key={o.value}
              type="button"
              size="sm"
              variant={cart.orderType === o.value ? 'default' : 'outline'}
              onClick={() => dispatch({ type: 'setOrderType', orderType: o.value })}
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-3">
        {empty ? (
          <p className="text-muted-foreground text-sm mt-6 text-center">
            <Trans>Belum ada item.</Trans>
          </p>
        ) : (
          <ul>
            {cart.lines.map((line) => (
              <CartLineRow
                key={line.lineKey}
                line={line}
                onIncrement={() => dispatch({ type: 'incrementQty', lineKey: line.lineKey })}
                onDecrement={() => dispatch({ type: 'decrementQty', lineKey: line.lineKey })}
                onRemove={() => dispatch({ type: 'removeLine', lineKey: line.lineKey })}
              />
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-border px-3 py-3 space-y-1 text-sm">
        <Row label={t`Subtotal`} value={formatIDR(subtotalIDR)} />
        {promo && !empty ? (
          <div className="flex items-center justify-between text-emerald-700">
            <span className="flex items-center gap-1">
              <Trans>Diskon</Trans> {promo.name} ({formatPromoValue(promo.type, promo.value)})
              <button
                type="button"
                onClick={onRemovePromo}
                aria-label={t`Hapus promo`}
                className="ml-0.5 rounded p-0.5 hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </span>
            <span className="tabular-nums">−{formatIDR(discountIDR)}</span>
          </div>
        ) : !empty && can('canDiscount') ? (
          <button
            type="button"
            onClick={onAddPromo}
            className="text-left text-primary hover:underline"
          >
            + <Trans>Tambah promo</Trans>
          </button>
        ) : null}
        {manualDiscount && !empty ? (
          <div className="flex items-center justify-between text-emerald-700">
            <span className="flex items-center gap-1">
              <Trans>Diskon manual</Trans>{' '}
              ({formatPromoValue(manualDiscount.type, manualDiscount.value)})
              <button
                type="button"
                onClick={onRemoveManualDiscount}
                aria-label={t`Hapus diskon`}
                className="ml-0.5 rounded p-0.5 hover:bg-muted"
              >
                <X className="size-3.5" />
              </button>
            </span>
          </div>
        ) : !empty && can('canDiscount') ? (
          <button
            type="button"
            onClick={onAddManualDiscount}
            className="block text-left text-primary hover:underline"
          >
            + <Trans>Diskon manual</Trans>
          </button>
        ) : null}
        {serviceChargeIDR > 0 ? (
          <Row
            label={`${serviceChargeName} ${serviceChargePct}%`}
            value={formatIDR(serviceChargeIDR)}
          />
        ) : null}
        {taxEnabled ? <Row label={t`PPN ${taxRatePct}%`} value={formatIDR(taxIDR)} /> : null}
        <Row label={t`Total`} value={formatIDR(totalIDR)} bold large />
        {payMethods.length === 0 ? (
          // No payment method is usable (all disabled, or QRIS enabled without an
          // uploaded image). Never leave the cart with zero buttons — surface a
          // disabled prompt that points the owner back to settings.
          <Button type="button" disabled className="w-full mt-2" size="lg">
            <Trans>Atur metode pembayaran</Trans>
          </Button>
        ) : (
          <div className="grid grid-cols-2 gap-2 mt-2">
            {payMethods.map((m) => (
              <Button
                key={m}
                type="button"
                onClick={() => onPay(m)}
                disabled={empty}
                className={payMethods.length === 1 ? 'col-span-2' : ''}
                size="lg"
              >
                {methodLabel(m)}
              </Button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  bold,
  large,
}: {
  label: string;
  value: string;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''} ${large ? 'text-base' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
