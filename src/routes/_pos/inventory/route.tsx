import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PinGate } from '~/components/staff/pin-gate';

export const Route = createFileRoute('/_pos/inventory')({
  component: InventoryLayout,
});

function InventoryLayout() {
  return (
    <PinGate>
      <Outlet />
    </PinGate>
  );
}
