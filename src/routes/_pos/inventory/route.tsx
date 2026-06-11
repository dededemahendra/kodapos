import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import { PinGate } from '~/components/staff/pin-gate';

export const Route = createFileRoute('/_pos/inventory')({
  component: InventoryLayout,
});

function InventoryLayout() {
  return (
    <RequirePermission perm="canEditMenu">
      <PinGate>
        <Outlet />
      </PinGate>
    </RequirePermission>
  );
}
