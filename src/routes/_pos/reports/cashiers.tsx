import { msg } from '@lingui/core/macro';
import { createFileRoute } from '@tanstack/react-router';
import { ComingSoon } from '~/components/coming-soon';

export const Route = createFileRoute('/_pos/reports/cashiers')({
  component: () => <ComingSoon title={msg`Laporan Kasir`} />,
});
