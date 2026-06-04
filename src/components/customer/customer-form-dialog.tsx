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
import { Textarea } from '~/components/ui/textarea';
import { toast } from '~/lib/toast';

export function CustomerFormDialog({
  open,
  customer,
  onOpenChange,
}: {
  open: boolean;
  customer: Doc<'customers'> | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = customer !== null;
  const create = useMutation(api.customers.create);
  const update = useMutation(api.customers.update);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(customer?.name ?? '');
      setPhone(customer?.phone ?? '');
      setNote(customer?.note ?? '');
      setError(null);
    }
  }, [open, customer]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (isEdit && customer) {
        await update({ id: customer._id, name, phone, note });
        toast.success(t`Pelanggan diperbarui.`);
      } else {
        await create({ name, phone, note });
        toast.success(t`Pelanggan ditambahkan.`);
      }
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t`Gagal menyimpan pelanggan.`;
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
            {isEdit ? <Trans>Ubah pelanggan</Trans> : <Trans>Tambah pelanggan</Trans>}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="customer-name">
                <Trans>Nama</Trans>
              </FieldLabel>
              <Input
                id="customer-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-phone">
                <Trans>Telepon</Trans>
              </FieldLabel>
              <Input
                id="customer-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-note">
                <Trans>Catatan</Trans>
              </FieldLabel>
              <Textarea
                id="customer-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
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
