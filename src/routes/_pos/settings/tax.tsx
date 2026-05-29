import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/settings/tax')({
  component: () => <ComingSoon title="Pajak & Pembayaran" />,
});
