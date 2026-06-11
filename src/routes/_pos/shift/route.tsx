import { createFileRoute, Outlet } from '@tanstack/react-router';
import { RequirePermission } from '~/components/permission/require-permission';
import { PinGate } from '~/components/staff/pin-gate';

export const Route = createFileRoute('/_pos/shift')({
  component: ShiftLayout,
});

function ShiftLayout() {
  return (
    <RequirePermission perm="canManageShift">
      <PinGate>
        <Outlet />
      </PinGate>
    </RequirePermission>
  );
}
