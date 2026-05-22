import { createFileRoute } from '@tanstack/react-router';
import { SaleScreen } from '~/components/sale/sale-screen';

export const Route = createFileRoute('/_pos/sale/')({
  component: SaleIndex,
});

function SaleIndex() {
  return <SaleScreen />;
}
