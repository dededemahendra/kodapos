import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/reports/products')({
  component: () => <ComingSoon title="Laporan Produk" />,
});
