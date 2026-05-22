import type { CartLine } from './cart-reducer';
import { Button } from '~/components/ui/button';
import { formatIDR } from '~/lib/money';

export function CartLineRow({
  line,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  line: CartLine;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="border-b border-border py-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-medium leading-tight">{line.nameSnapshot}</div>
        <div className="text-sm tabular-nums">{formatIDR(line.qty * line.unitPriceIDR)}</div>
      </div>
      {line.modifierLabels.length > 0 ? (
        <ul className="text-xs text-fg-muted mt-0.5">
          {line.modifierLabels.map((m, i) => (
            <li key={`${line.lineKey}-mod-${i}`}>
              • {m.groupName}: {m.optionName}
              {m.priceAdjustmentIDR > 0 ? ` (+${formatIDR(m.priceAdjustmentIDR)})` : ''}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex items-center justify-between mt-1.5">
        <div className="text-xs text-fg-muted">{formatIDR(line.unitPriceIDR)} / item</div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDecrement}
            aria-label="Kurangi jumlah"
          >
            −
          </Button>
          <span className="w-7 text-center text-sm tabular-nums" aria-label={`Jumlah ${line.qty}`}>
            {line.qty}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onIncrement}
            aria-label="Tambah jumlah"
            disabled={line.qty >= 99}
          >
            +
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label="Hapus baris"
            className="text-fg-muted hover:text-red-600"
          >
            ×
          </Button>
        </div>
      </div>
    </li>
  );
}
