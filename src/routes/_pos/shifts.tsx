import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/shifts')({
  component: () => <ComingSoon title="Shift" />,
});
