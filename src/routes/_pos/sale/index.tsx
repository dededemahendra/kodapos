import { createFileRoute } from '@tanstack/react-router';
import { SaleScreen } from '~/components/sale/sale-screen';

export const Route = createFileRoute('/_pos/sale/')({
  // Task 3 will build on this: recall resumes a held order, table seeds a new one.
  validateSearch: (s: Record<string, unknown>) => ({
    ...(typeof s.recall === 'string' ? { recall: s.recall } : {}),
    ...(typeof s.table === 'string' ? { table: s.table } : {}),
  }),
  component: SaleIndex,
});

function SaleIndex() {
  const { recall, table } = Route.useSearch();
  // The full-screen shell + top bar is provided by the _pos layout for all
  // operational screens (sale/tables/kitchen); this route just renders the screen.
  return <SaleScreen recall={recall} table={table} />;
}
