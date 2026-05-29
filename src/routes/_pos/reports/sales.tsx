import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/reports/sales')({
  component: () => <ComingSoon title="Laporan Penjualan" />,
});
