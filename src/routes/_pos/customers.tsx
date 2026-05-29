import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/customers')({
  component: () => <ComingSoon title="Pelanggan" />,
});
