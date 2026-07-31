import { createFileRoute } from '@tanstack/react-router';
import { PriceCategoryTable } from '~/components/menu/price-category-table';

export const Route = createFileRoute('/_pos/menu/price-categories')({
  component: PriceCategoriesPage,
});

function PriceCategoriesPage() {
  return <PriceCategoryTable />;
}
