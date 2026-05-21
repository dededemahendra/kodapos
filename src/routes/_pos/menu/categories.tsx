import { createFileRoute } from '@tanstack/react-router';
import { CategoryTable } from '~/components/menu/category-table';

export const Route = createFileRoute('/_pos/menu/categories')({
  component: CategoriesPage,
});

function CategoriesPage() {
  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Kategori</h1>
      <p className="text-fg-muted text-sm mb-4">
        Kategori muncul sebagai filter di daftar Items dan di layar kasir.
      </p>
      <CategoryTable />
    </div>
  );
}
