import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/inventory/waste')({
  component: () => <ComingSoon title={msg`Catat Limbah`} />,
});
