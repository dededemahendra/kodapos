import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Doc } from 'convex/_generated/dataModel';
import { useMutation } from 'convex/react';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import { Spinner } from '~/components/ui/spinner';
import { formatIDR } from '~/lib/money';
import { toast } from '~/lib/toast';

export function GiftCardIssueDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const issue = useMutation(api.giftCards.issue);
  const [code, setCode] = useState('');
  const [balance, setBalance] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setBalance('');
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const balanceIDR = Number.parseInt(balance, 10);
      if (!Number.isInteger(balanceIDR) || balanceIDR <= 0) {
        throw new Error(t`Saldo kartu harus lebih dari 0.`);
      }
      await issue({ code, balanceIDR });
      toast.success(t`Kartu hadiah diterbitkan.`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menerbitkan kartu hadiah.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Terbitkan kartu</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="giftcard-code">
                <Trans>Kode kartu</Trans>
              </FieldLabel>
              <Input
                id="giftcard-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                minLength={4}
                maxLength={40}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="giftcard-balance">
                <Trans>Saldo awal</Trans>
              </FieldLabel>
              <Input
                id="giftcard-balance"
                type="number"
                inputMode="numeric"
                min={1}
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                required
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Terbitkan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GiftCardTopupDialog({
  open,
  card,
  onOpenChange,
}: {
  open: boolean;
  card: Doc<'giftCards'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const topup = useMutation(api.giftCards.topup);
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount('');
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting || !card) return;
    setSubmitting(true);
    setError(null);
    try {
      const amountIDR = Number.parseInt(amount, 10);
      if (!Number.isInteger(amountIDR) || amountIDR <= 0) {
        throw new Error(t`Jumlah pengisian harus lebih dari 0.`);
      }
      await topup({ id: card._id, amountIDR });
      toast.success(t`Saldo kartu ditambahkan.`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal mengisi saldo kartu.`;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Isi saldo</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            {card ? (
              <Field>
                <FieldLabel>
                  <Trans>Kartu</Trans>
                </FieldLabel>
                <p className="text-sm text-muted-foreground tabular-nums">
                  {card.code} · {formatIDR(card.balanceIDR)}
                </p>
              </Field>
            ) : null}
            <Field>
              <FieldLabel htmlFor="giftcard-topup-amount">
                <Trans>Jumlah pengisian</Trans>
              </FieldLabel>
              <Input
                id="giftcard-topup-amount"
                type="number"
                inputMode="numeric"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                autoFocus
              />
            </Field>
            {error && <FieldError>{error}</FieldError>}
          </FieldGroup>
          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Spinner data-icon="inline-start" />}
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Isi saldo</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
