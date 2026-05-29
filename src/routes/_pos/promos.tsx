import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/promos')({
  component: () => <ComingSoon title="Promo & Diskon" />,
});
