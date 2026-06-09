import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { X } from 'lucide-react';
import { Button } from '~/components/ui/button';
import { formatIDR } from '~/lib/money';
import { formatPromoValue } from '~/lib/promo';
import type { CartAction, CartPromo, CartState } from './cart-reducer';
import { CartLineRow } from './cart-line-row';

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
  payMethods,
  onPay,
  onKosongkan,
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
  payMethods: Array<'cash' | 'qris_static'>;
  onPay: (method: 'cash' | 'qris_static') => void;
  onKosongkan: () => void;
}) {
  const { t } = useLingui();
  const empty = cart.lines.length === 0;

  return (
    <aside className="border-l border-border flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-sm font-semibold">
          <Trans>Pesanan ({cart.lines.length})</Trans>
        </h2>
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
        ) : !empty ? (
          <button
            type="button"
            onClick={onAddPromo}
            className="text-left text-primary hover:underline"
          >
            + <Trans>Tambah promo</Trans>
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
                {m === 'cash' ? <Trans>Tunai</Trans> : <Trans>QRIS</Trans>}
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
