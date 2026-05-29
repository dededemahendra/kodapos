import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/inventory/purchases')({
  component: () => <ComingSoon title="Pembelian" />,
});
