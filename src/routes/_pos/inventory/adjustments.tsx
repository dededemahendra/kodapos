import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/inventory/adjustments')({
  component: () => <ComingSoon title="Penyesuaian Stok" />,
});
