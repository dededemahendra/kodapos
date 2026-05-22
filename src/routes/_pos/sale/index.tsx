import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_pos/sale/')({
  component: SaleIndex,
});

function SaleIndex() {
  return <div className="p-6 text-fg-muted">Sale screen — coming up next.</div>;
}
