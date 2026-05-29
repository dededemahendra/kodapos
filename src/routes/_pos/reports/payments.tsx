import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/reports/payments')({
  component: () => <ComingSoon title="Laporan Pembayaran" />,
});
