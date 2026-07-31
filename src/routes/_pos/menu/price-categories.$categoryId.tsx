import { createFileRoute } from '@tanstack/react-router';
import type { Id } from 'convex/_generated/dataModel';
import { PriceGrid } from '~/components/menu/price-grid';

export const Route = createFileRoute('/_pos/menu/price-categories/$categoryId')({
  component: PriceGridPage,
});

function PriceGridPage() {
  const { categoryId } = Route.useParams();
  return <PriceGrid categoryId={categoryId as Id<'priceCategories'>} />;
}
