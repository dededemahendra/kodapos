import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import type { LoyaltyConfig } from 'convex/lib/loyalty';
import { maxRedeemablePoints, redemptionIDR } from 'convex/lib/loyalty';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export type CustomerSelection = {
  customerId?: Id<'customers'>;
  customerName?: string;
  pointsBalance?: number;
  redeemPoints: number;
  redeemRewardId?: Id<'loyaltyRewards'>;
  redeemRewardIDR?: number;
};

/** Count of phone digits required before we run a lookup query. */
const MIN_PHONE_DIGITS = 8;
const PHONE_DEBOUNCE_MS = 350;

function digitCount(s: string): number {
  return s.replace(/\D/g, '').length;
}

export function CustomerSection({
  cafeLoyalty,
  afterPromoIDR,
  value,
  onChange,
}: {
  cafeLoyalty: LoyaltyConfig;
  afterPromoIDR: number;
  value: CustomerSelection;
  onChange: (next: CustomerSelection) => void;
}) {
  const { t } = useLingui();
  const createCustomer = useMutation(api.customers.create);
  const [phone, setPhone] = useState('');
  const [debouncedPhone, setDebouncedPhone] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Debounce the phone the lookup query keys on, so we don't fire on every keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebouncedPhone(phone), PHONE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [phone]);

  const phoneReady = digitCount(debouncedPhone) >= MIN_PHONE_DIGITS;
  const lookup = useQuery(
    api.customers.findByPhone,
    phoneReady && !value.customerId ? { phone: debouncedPhone } : 'skip'
  );

  // When a lookup resolves to a customer, select it.
  useEffect(() => {
    if (lookup && !value.customerId) {
      onChange({
        customerId: lookup._id,
        customerName: lookup.name,
        pointsBalance: lookup.pointsBalance,
        redeemPoints: 0,
      });
      setShowCreate(false);
    }
    // onChange/value intentionally excluded — guarded by value.customerId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);

  const selected = value.customerId !== undefined;
  const notFound = phoneReady && !selected && lookup === null;

  // Affordable active rewards for the selected customer (the checkout picker).
  const rewards = useQuery(
    api.loyaltyRewards.listForCustomer,
    value.customerId ? { customerId: value.customerId } : 'skip'
  );
  const NO_REWARD = '__none__';

  function clearCustomer() {
    setPhone('');
    setDebouncedPhone('');
    setShowCreate(false);
    setNewName('');
    onChange({ redeemPoints: 0 });
  }

  async function createAndSelect() {
    const name = newName.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    try {
      const id = await createCustomer({ name, phone: debouncedPhone });
      onChange({
        customerId: id,
        customerName: name,
        pointsBalance: 0,
        redeemPoints: 0,
      });
      setShowCreate(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t`Gagal menambah pelanggan.`);
    } finally {
      setSubmitting(false);
    }
  }

  const balance = value.pointsBalance ?? 0;
  const canRedeem = selected && cafeLoyalty.enabled && balance >= cafeLoyalty.redeemBlockPoints;
  const maxPoints = useMemo(
    () => maxRedeemablePoints(balance, afterPromoIDR, cafeLoyalty),
    [balance, afterPromoIDR, cafeLoyalty]
  );

  // Whole-block options up to the redeemable max (cap the button count).
  const blockOptions = useMemo(() => {
    const out: number[] = [];
    for (
      let p = cafeLoyalty.redeemBlockPoints;
      p <= maxPoints && out.length < 6;
      p += cafeLoyalty.redeemBlockPoints
    ) {
      out.push(p);
    }
    return out;
  }, [maxPoints, cafeLoyalty.redeemBlockPoints]);

  const redeemIDR = redemptionIDR(value.redeemPoints, cafeLoyalty);

  return (
    <div className="rounded-md border border-border px-3 py-2.5 space-y-2 text-sm">
      {!selected ? (
        <>
          <Input
            type="tel"
            inputMode="numeric"
            placeholder={t`No. HP pelanggan`}
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              setShowCreate(false);
            }}
          />
          {phoneReady && lookup === undefined ? (
            <div className="flex items-center gap-2 text-muted-foreground text-xs">
              <Spinner data-icon="inline-start" />
              <Trans>Mencari…</Trans>
            </div>
          ) : null}
          {notFound && !showCreate ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="text-left text-primary hover:underline"
            >
              + <Trans>Tambah pelanggan baru</Trans>
            </button>
          ) : null}
          {notFound && showCreate ? (
            <div className="space-y-2">
              <Input
                placeholder={t`Nama pelanggan`}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={createAndSelect}
                  disabled={!newName.trim() || submitting}
                >
                  {submitting ? <Spinner data-icon="inline-start" /> : null}
                  <Trans>Simpan</Trans>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setShowCreate(false);
                    setNewName('');
                  }}
                >
                  <Trans>Batal</Trans>
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{value.customerName}</div>
              <div className="text-xs text-muted-foreground">
                <Trans>Saldo: {balance} poin</Trans>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={clearCustomer}
            >
              <Trans>Ganti</Trans>
            </Button>
          </div>

          {rewards && rewards.length > 0 ? (
            <div className="space-y-1.5 border-t border-border pt-2">
              <div className="text-xs font-medium text-muted-foreground">
                <Trans>Tukar reward</Trans>
              </div>
              <Select
                value={value.redeemRewardId ?? NO_REWARD}
                onValueChange={(v) => {
                  if (v === NO_REWARD) {
                    const { redeemRewardId: _id, redeemRewardIDR: _idr, ...rest } = value;
                    onChange(rest);
                    return;
                  }
                  const reward = rewards.find((r) => r._id === v);
                  if (!reward) return;
                  onChange({
                    ...value,
                    redeemRewardId: reward._id,
                    redeemRewardIDR: reward.discountIDR,
                    redeemPoints: 0,
                  });
                }}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REWARD}>
                    <Trans>Tanpa reward</Trans>
                  </SelectItem>
                  {rewards.map((r) => {
                    const points = r.pointsCost;
                    return (
                      <SelectItem key={r._id} value={r._id}>
                        {r.name} · {t`${points} poin`} · {formatIDR(r.discountIDR)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {value.redeemRewardId && value.redeemRewardIDR ? (
                <div className="flex justify-between text-emerald-700">
                  <span>
                    <Trans>Diskon reward</Trans>
                  </span>
                  <span className="tabular-nums">−{formatIDR(value.redeemRewardIDR)}</span>
                </div>
              ) : null}
            </div>
          ) : null}

          {canRedeem && !value.redeemRewardId ? (
            <div className="space-y-1.5 border-t border-border pt-2">
              <div className="text-xs font-medium text-muted-foreground">
                <Trans>Tukar poin</Trans>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {blockOptions.map((p) => (
                  <button
                    type="button"
                    key={p}
                    onClick={() => onChange({ ...value, redeemPoints: p })}
                    className={`text-xs px-2 py-1 rounded-md border ${
                      value.redeemPoints === p
                        ? 'border-ring bg-accent text-primary'
                        : 'border-border bg-background hover:bg-muted'
                    }`}
                  >
                    {p}
                  </button>
                ))}
                {maxPoints > 0 && !blockOptions.includes(maxPoints) ? (
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, redeemPoints: maxPoints })}
                    className={`text-xs px-2 py-1 rounded-md border ${
                      value.redeemPoints === maxPoints
                        ? 'border-ring bg-accent text-primary'
                        : 'border-border bg-background hover:bg-muted'
                    }`}
                  >
                    <Trans>Maks ({maxPoints})</Trans>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, redeemPoints: maxPoints })}
                    className="text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-muted"
                  >
                    <Trans>Maks</Trans>
                  </button>
                )}
                {value.redeemPoints > 0 ? (
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, redeemPoints: 0 })}
                    className="text-xs px-2 py-1 rounded-md border border-border bg-background hover:bg-muted text-muted-foreground"
                  >
                    <Trans>Hapus</Trans>
                  </button>
                ) : null}
              </div>
              {redeemIDR > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <span>
                    <Trans>Poin ditukar ({value.redeemPoints})</Trans>
                  </span>
                  <span className="tabular-nums">−{formatIDR(redeemIDR)}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
