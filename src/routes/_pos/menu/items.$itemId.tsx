import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { RecipeEditor } from '~/components/inventory/recipe-editor';
import { ItemEditForm } from '~/components/menu/item-edit-form';

export const Route = createFileRoute('/_pos/menu/items/$itemId')({
  component: ItemEditPage,
});

function ItemEditPage() {
  const { itemId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = itemId === 'new';
  const detail = useQuery(
    api.menu.items.getById,
    isNew ? 'skip' : { id: itemId as Id<'menuItems'> }
  );

  if (!isNew && detail === undefined) return <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>;
  if (!isNew && detail === null) return <p className="text-muted-foreground"><Trans>Item tidak ditemukan.</Trans></p>;

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">
        <Link to="/menu" className="hover:underline">
          <Trans>Menu</Trans>
        </Link>{' '}
        ›{' '}
        <Link to="/menu" className="hover:underline">
          <Trans>Items</Trans>
        </Link>{' '}
        › {isNew ? <Trans>Baru</Trans> : detail?.item.name}
      </div>
      <h1 className="text-xl font-bold mb-4">{isNew ? <Trans>Item baru</Trans> : detail?.item.name}</h1>
      <ItemEditForm
        itemId={isNew ? 'new' : (itemId as Id<'menuItems'>)}
        initial={{
          name: detail?.item.name ?? '',
          categoryId: detail?.item.categoryId ?? '',
          priceIDR: detail?.item.priceIDR ?? 0,
          isActive: detail?.item.isActive ?? true,
          ...(detail?.item.imageStorageId ? { imageStorageId: detail.item.imageStorageId } : {}),
          imageUrl: detail?.imageUrl ?? null,
        }}
        attached={(detail?.attachedGroups ?? []).map((a) => ({
          group: a.group,
          position: a.position,
        }))}
        onSaved={() => navigate({ to: '/menu' })}
      />
      {!isNew ? <RecipeEditor menuItemId={itemId as Id<'menuItems'>} /> : null}
    </div>
  );
}
