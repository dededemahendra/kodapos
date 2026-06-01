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

export function SupplierFormDialog({
  open,
  supplier,
  onOpenChange,
}: {
  open: boolean;
  supplier: Doc<'suppliers'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = supplier !== null;
  const create = useMutation(api.suppliers.create);
  const update = useMutation(api.suppliers.update);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(supplier?.name ?? '');
      setPhone(supplier?.phone ?? '');
      setError(null);
    }
  }, [open, supplier]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && supplier) {
        await update({ id: supplier._id, name, phone });
        toast.success(t`Pemasok diperbarui.`);
      } else {
        await create({ name, phone });
        toast.success(t`Pemasok ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan pemasok.`;
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
            {isEdit ? <Trans>Ubah pemasok</Trans> : <Trans>Tambah pemasok</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="supplier-name">
                <Trans>Nama pemasok</Trans>
              </FieldLabel>
              <Input
                id="supplier-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="supplier-phone">
                <Trans>Telepon</Trans>
              </FieldLabel>
              <Input
                id="supplier-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
