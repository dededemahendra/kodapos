import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/settings/integrations')({
  component: () => <ComingSoon title="Integrasi" />,
});
