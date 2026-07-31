import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { PriceGrid } from '~/components/menu/price-grid';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_pos/menu/price-categories/$categoryId')({
  component: PriceGridPage,
});

function PriceGridPage() {
  const { categoryId } = Route.useParams();
  // Reuses priceCategories.list (already the query the parent table renders
  // from) instead of adding a getById query just to read one name: it is the
  // same small, active-only set for one cafe, and it doubles as the not-found
  // check below, an archived category is absent from it too, the same as a
  // category that never existed or belongs to another cafe.
  const categories = useQuery(api.menu.priceCategories.list, {});

  if (categories === undefined)
    return (
      <div>
        <Skeleton className="mb-2 h-3 w-40" />
        <Skeleton className="h-7 w-48" />
      </div>
    );

  const category = categories.find((c) => c._id === categoryId);
  if (!category)
    return (
      <p className="text-muted-foreground">
        <Trans>Kategori harga tidak ditemukan.</Trans>
      </p>
    );

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">
        <Link to="/menu/price-categories" className="hover:underline">
          <Trans>Kategori harga</Trans>
        </Link>{' '}
        › {category.name}
      </div>
      <h1 className="text-xl font-bold mb-4">{category.name}</h1>
      <PriceGrid categoryId={categoryId as Id<'priceCategories'>} />
    </div>
  );
}
