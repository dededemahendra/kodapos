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
import { toast } from '~/lib/toast';

type Reward = Doc<'loyaltyRewards'>;

export function RewardFormDialog({
  open,
  editing,
  onOpenChange,
}: {
  open: boolean;
  editing?: Reward | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = editing != null;
  const create = useMutation(api.loyaltyRewards.create);
  const update = useMutation(api.loyaltyRewards.update);
  const [name, setName] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [discountIDR, setDiscountIDR] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed from the editing reward (or reset) whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setName(editing?.name ?? '');
      setPointsCost(editing ? String(editing.pointsCost) : '');
      setDiscountIDR(editing ? String(editing.discountIDR) : '');
      setError(null);
    }
  }, [open, editing]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;

    const trimmedName = name.trim();
    // parseInt so non-integers are rejected by the guards below rather than
    // silently truncated server-side.
    const points = Number.parseInt(pointsCost, 10);
    const discount = Number.parseInt(discountIDR, 10);

    if (trimmedName.length === 0) {
      setError(t`Nama reward wajib diisi.`);
      return;
    }
    if (!Number.isInteger(points) || points <= 0) {
      setError(t`Poin harus lebih dari 0.`);
      return;
    }
    if (!Number.isInteger(discount) || discount <= 0) {
      setError(t`Diskon harus lebih dari 0.`);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && editing) {
        await update({
          id: editing._id,
          name: trimmedName,
          pointsCost: points,
          discountIDR: discount,
        });
        toast.success(t`Reward diperbarui.`);
      } else {
        await create({ name: trimmedName, pointsCost: points, discountIDR: discount });
        toast.success(t`Reward ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan reward.`;
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
            {isEdit ? <Trans>Ubah reward</Trans> : <Trans>Tambah reward</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reward-name">
                <Trans>Nama</Trans>
              </FieldLabel>
              <Input
                id="reward-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reward-points">
                <Trans>Poin</Trans>
              </FieldLabel>
              <Input
                id="reward-points"
                type="number"
                min="1"
                step="1"
                value={pointsCost}
                onChange={(e) => setPointsCost(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reward-discount">
                <Trans>Diskon</Trans>
              </FieldLabel>
              <Input
                id="reward-discount"
                type="number"
                min="1"
                step="1"
                value={discountIDR}
                onChange={(e) => setDiscountIDR(e.target.value)}
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
              {submitting ? <Trans>Menyimpan…</Trans> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
