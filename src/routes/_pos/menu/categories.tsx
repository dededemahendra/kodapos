import { createFileRoute } from '@tanstack/react-router';
import { CategoryTable } from '~/components/menu/category-table';

export const Route = createFileRoute('/_pos/menu/categories')({
  component: CategoriesPage,
});

function CategoriesPage() {
  return <CategoryTable />;
}
