import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Tags } from 'lucide-react';
import { useState } from 'react';
import { ConfirmArchive } from '~/components/menu/confirm-archive';
import { PriceCategoryFormDialog } from '~/components/menu/price-category-form-dialog';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

type Row = { _id: Id<'priceCategories'>; name: string };

export function PriceCategoryTable() {
  const { t } = useLingui();
  const categories = useQuery(api.menu.priceCategories.list, {});
  const archive = useMutation(api.menu.priceCategories.archive);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  async function onArchive(row: Row) {
    try {
      await archive({ id: row._id });
    } catch {
      toast.error(t`Gagal mengarsipkan kategori harga.`);
    }
  }

  if (categories === undefined) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Trans>Kategori harga baru</Trans>
        </Button>
      </div>

      {categories.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Tags />
            </EmptyMedia>
            <EmptyTitle>
              <Trans>Belum ada kategori harga.</Trans>
            </EmptyTitle>
            <EmptyDescription>
              <Trans>
                Buat kategori seperti Turis atau Member untuk memakai harga berbeda pada menu yang
                sama. Harga menu Anda sekarang tetap menjadi harga standar.
              </Trans>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {categories.map((c) => (
            <li key={c._id} className="flex items-center justify-between px-4 py-3">
              <Link
                to="/menu/price-categories/$categoryId"
                params={{ categoryId: c._id }}
                className="font-medium hover:underline"
              >
                {c.name}
              </Link>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEditing({ _id: c._id, name: c.name });
                    setDialogOpen(true);
                  }}
                >
                  <Trans>Ubah</Trans>
                </Button>
                <ConfirmArchive
                  noun={t`kategori harga`}
                  name={c.name}
                  onConfirm={() => onArchive({ _id: c._id, name: c.name })}
                  trigger={
                    <Button variant="outline" size="sm">
                      <Trans>Arsipkan</Trans>
                    </Button>
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      <PriceCategoryFormDialog
        open={dialogOpen}
        category={editing}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
