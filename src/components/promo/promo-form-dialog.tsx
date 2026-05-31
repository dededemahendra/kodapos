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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type PromoType = 'percent' | 'fixed';

export function PromoFormDialog({
  open,
  promo,
  onOpenChange,
}: {
  open: boolean;
  promo: Doc<'promotions'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = promo !== null;
  const create = useMutation(api.promotions.create);
  const update = useMutation(api.promotions.update);
  const [name, setName] = useState('');
  const [type, setType] = useState<PromoType>('percent');
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(promo?.name ?? '');
      setType(promo?.type ?? 'percent');
      setValue(promo ? String(promo.value) : '');
      setError(null);
    }
  }, [open, promo]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const parsedValue = Number.parseInt(value, 10);
    try {
      if (isEdit && promo) {
        await update({ id: promo._id, name, type, value: parsedValue });
        toast.success(t`Promo diperbarui.`);
      } else {
        await create({ name, type, value: parsedValue });
        toast.success(t`Promo ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan promo.`;
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
            {isEdit ? <Trans>Ubah promo</Trans> : <Trans>Tambah promo</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="promo-name"><Trans>Nama promo</Trans></FieldLabel>
              <Input
                id="promo-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-type"><Trans>Tipe</Trans></FieldLabel>
              <Select value={type} onValueChange={(v) => setType(v as PromoType)}>
                <SelectTrigger id="promo-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t`Persen`}</SelectItem>
                  <SelectItem value="fixed">{t`Nominal`}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="promo-value">
                {type === 'percent' ? <Trans>Nilai (%)</Trans> : <Trans>Nilai (Rp)</Trans>}
              </FieldLabel>
              <Input
                id="promo-value"
                type="number"
                min="1"
                {...(type === 'percent' ? { max: '100' } : {})}
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
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
