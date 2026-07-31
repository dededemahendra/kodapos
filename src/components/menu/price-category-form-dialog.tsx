import { Trans, useLingui } from '@lingui/react/macro';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
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

export function PriceCategoryFormDialog({
  open,
  category,
  onOpenChange,
}: {
  open: boolean;
  /** null = create mode; otherwise rename the given category. */
  category: { _id: Id<'priceCategories'>; name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLingui();
  const isEdit = category !== null;
  const create = useMutation(api.menu.priceCategories.create);
  const update = useMutation(api.menu.priceCategories.update);
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setError(null);
    }
  }, [open, category]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t`Nama wajib diisi.`);
      return;
    }
    setSubmitting(true);
    try {
      if (category) await update({ id: category._id, name: trimmed });
      else await create({ name: trimmed });
      onOpenChange(false);
    } catch {
      toast.error(t`Gagal menyimpan kategori harga.`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? <Trans>Ubah kategori harga</Trans> : <Trans>Kategori harga baru</Trans>}
            </DialogTitle>
          </DialogHeader>
          <FieldGroup className="py-4">
            <Field>
              <FieldLabel htmlFor="pc-name">
                <Trans>Nama</Trans>
              </FieldLabel>
              <Input
                id="pc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t`Turis`}
                autoFocus
              />
              {error ? <FieldError>{error}</FieldError> : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Spinner /> : <Trans>Simpan</Trans>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
