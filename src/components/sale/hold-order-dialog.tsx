import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import type { CartState } from './cart-reducer';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

const NO_TABLE = '__none__';

export function HoldOrderDialog({
  open,
  cart,
  cashierId,
  defaultTableId,
  onOpenChange,
  onHeld,
}: {
  open: boolean;
  cart: CartState;
  cashierId: Id<'cafeStaff'>;
  defaultTableId?: Id<'tables'>;
  onOpenChange: (open: boolean) => void;
  onHeld: () => void;
}) {
  const { t } = useLingui();
  const hold = useMutation(api.heldOrders.hold);
  const floor = useQuery(api.tables.floor, {});
  const [label, setLabel] = useState('');
  const [tableValue, setTableValue] = useState<string>(NO_TABLE);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setLabel('');
      setTableValue(defaultTableId ?? NO_TABLE);
    }
  }, [open, defaultTableId]);

  // Selectable tables: empty ones, plus the current table (defaultTableId) even
  // if it reads occupied-by-self.
  const tableOptions = (floor ?? []).filter(
    (tbl) => !tbl.occupied || tbl._id === defaultTableId
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || cart.lines.length === 0) return;
    setSubmitting(true);
    const selectedTableId = tableValue === NO_TABLE ? null : (tableValue as Id<'tables'>);
    const selectedTableName = selectedTableId
      ? tableOptions.find((tbl) => tbl._id === selectedTableId)?.name
      : undefined;
    const effectiveLabel = label.trim() || (selectedTableName ?? '');
    try {
      await hold({
        cashierId,
        label: effectiveLabel,
        orderType: cart.orderType,
        lines: cart.lines.map((l) => ({
          menuItemId: l.menuItemId,
          nameSnapshot: l.nameSnapshot,
          qty: l.qty,
          unitPriceIDR: l.unitPriceIDR,
          modifierOptionIds: l.modifierOptionIds,
          modifierLabels: l.modifierLabels,
        })),
        ...(cart.promo
          ? {
              promo: {
                promoId: cart.promo._id,
                name: cart.promo.name,
                type: cart.promo.type,
                value: cart.promo.value,
              },
            }
          : {}),
        ...(selectedTableId ? { tableId: selectedTableId } : {}),
      });
      toast.success(t`Pesanan ditahan.`);
      onHeld(); // parent clears the cart + closes
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menahan pesanan.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Tahan pesanan</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <Field>
            <FieldLabel htmlFor="hold-label">
              <Trans>Nama / meja</Trans>
            </FieldLabel>
            <Input
              id="hold-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={40}
              autoFocus
              placeholder={t`Nama / meja`}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="hold-table">
              <Trans>Meja</Trans>
            </FieldLabel>
            <Select value={tableValue} onValueChange={setTableValue}>
              <SelectTrigger id="hold-table">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TABLE}>
                  {t`Tanpa meja`}
                </SelectItem>
                {tableOptions.map((tbl) => (
                  <SelectItem key={tbl._id} value={tbl._id}>
                    {tbl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting || cart.lines.length === 0}>
              {submitting && <Spinner data-icon="inline-start" />}
              <Trans>Tahan</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
