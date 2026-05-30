import { useLingui } from '@lingui/react/macro';
import { Trans } from '@lingui/react/macro';
import { Button } from '~/components/ui/button';
import { formatIDR } from '~/lib/money';
import type { CartAction, CartState } from './cart-reducer';
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
  onBayar,
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
  onBayar: () => void;
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
        {serviceChargeIDR > 0 ? (
          <Row
            label={`${serviceChargeName} ${serviceChargePct}%`}
            value={formatIDR(serviceChargeIDR)}
          />
        ) : null}
        {taxEnabled ? <Row label={t`PPN ${taxRatePct}%`} value={formatIDR(taxIDR)} /> : null}
        <Row label={t`Total`} value={formatIDR(totalIDR)} bold large />
        <Button
          type="button"
          onClick={onBayar}
          disabled={empty}
          className="w-full mt-2"
          size="lg"
        >
          <Trans>Bayar</Trans>
        </Button>
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
