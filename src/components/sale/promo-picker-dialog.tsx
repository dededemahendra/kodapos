import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import { useConvex, useQuery } from 'convex/react';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import type { CartPromo } from './cart-reducer';
import { BadgePercent } from 'lucide-react';
import { formatPromoValue } from '~/lib/promo';

/** Map a promo doc (from list/resolveByCode) to the cart's promo shape, carrying
 *  the scope + targets so the on-screen preview discounts only matching lines. */
function toCartPromo(p: {
  _id: CartPromo['_id'];
  name: string;
  type: 'percent' | 'fixed';
  value: number;
  scope?: 'order' | 'item' | 'category';
  targetItemIds?: string[];
  targetCategoryIds?: string[];
}): CartPromo {
  return {
    _id: p._id,
    name: p.name,
    type: p.type,
    value: p.value,
    ...(p.scope ? { scope: p.scope } : {}),
    ...(p.targetItemIds ? { targetItemIds: p.targetItemIds } : {}),
    ...(p.targetCategoryIds ? { targetCategoryIds: p.targetCategoryIds } : {}),
  };
}

export function PromoPickerDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (promo: CartPromo) => void;
}) {
  const { t } = useLingui();
  const convex = useConvex();
  // Active promos only (list() defaults to non-archived).
  const promos = useQuery(api.promotions.list, open ? {} : 'skip');
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(false);
  const [resolving, setResolving] = useState(false);

  function pick(promo: CartPromo) {
    onSelect(promo);
    onOpenChange(false);
  }

  async function applyCode() {
    const trimmed = code.trim();
    if (trimmed.length === 0) return;
    setResolving(true);
    setCodeError(false);
    try {
      const promo = await convex.query(api.promotions.resolveByCode, { code: trimmed });
      if (promo) pick(toCartPromo(promo));
      else setCodeError(true);
    } finally {
      setResolving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Pilih promo</Trans>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setCodeError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void applyCode();
              }}
              placeholder={t`Masukkan kode`}
              autoCapitalize="characters"
            />
            <Button type="button" onClick={() => void applyCode()} disabled={resolving}>
              <Trans>Pakai</Trans>
            </Button>
          </div>
          {codeError ? (
            <p className="text-sm text-destructive">
              <Trans>Kode tidak valid.</Trans>
            </p>
          ) : null}
        </div>
        <div className="text-xs font-medium uppercase text-muted-foreground">
          <Trans>atau pilih promo</Trans>
        </div>
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
                  onClick={() => pick(toCartPromo(p))}
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
