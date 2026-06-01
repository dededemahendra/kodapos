import { Trans } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import type { CartPromo } from './cart-reducer';
import { BadgePercent } from 'lucide-react';
import { formatPromoValue } from '~/lib/promo';

export function PromoPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (promo: CartPromo) => void;
}) {
  // Active promos only (list() defaults to non-archived).
  const promos = useQuery(api.promotions.list, open ? {} : 'skip');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pilih promo</Trans>
          </DialogTitle>
        </DialogHeader>
        {promos === undefined ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Spinner />
          </div>
        ) : promos.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BadgePercent />
              </EmptyMedia>
              <EmptyTitle>
                <Trans>Belum ada promo aktif.</Trans>
              </EmptyTitle>
              <EmptyDescription>
                <Trans>Buat promo di halaman Promo & Diskon.</Trans>
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {promos.map((p) => (
              <li key={p._id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-1 py-3 text-left hover:bg-muted"
                  onClick={() => {
                    onSelect({ _id: p._id, name: p.name, type: p.type, value: p.value });
                    onOpenChange(false);
                  }}
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {formatPromoValue(p.type, p.value)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
