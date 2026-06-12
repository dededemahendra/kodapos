import { Trans, useLingui } from '@lingui/react/macro';
import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '~/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '~/components/ui/field';
import { Input } from '~/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select';
import { toast } from '~/lib/toast';
import type { ManualDiscount } from './cart-reducer';

export function ManualDiscountDialog({
  open,
  current,
  onOpenChange,
  onApply,
  onRemove,
}: {
  open: boolean;
  current: ManualDiscount | null;
  onOpenChange: (o: boolean) => void;
  onApply: (d: ManualDiscount) => void;
  onRemove: () => void;
}) {
  const { t } = useLingui();
  const [type, setType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) {
      setType(current?.type ?? 'percent');
      setValue(current ? String(current.value) : '');
    }
  }, [open, current]);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      toast.error(t`Diskon tidak valid.`);
      return;
    }
    if (type === 'percent' && parsed > 100) {
      toast.error(t`Diskon persen maksimal 100.`);
      return;
    }
    onApply({ type, value: parsed });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            <Trans>Diskon manual</Trans>
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="manual-discount-type">
                <Trans>Diskon</Trans>
              </FieldLabel>
              <Select
                value={type}
                onValueChange={(v) => setType(v as 'percent' | 'fixed')}
              >
                <SelectTrigger id="manual-discount-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">{t`Persen`}</SelectItem>
                  <SelectItem value="fixed">{t`Rupiah`}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="manual-discount-value">
                <Trans>Nilai diskon</Trans>
              </FieldLabel>
              <Input
                id="manual-discount-value"
                type="number"
                min="0"
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
                autoFocus
              />
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-4">
            {current && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onRemove();
                  onOpenChange(false);
                }}
              >
                <Trans>Hapus diskon</Trans>
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              <Trans>Batal</Trans>
            </Button>
            <Button type="submit">
              <Trans>Terapkan</Trans>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
