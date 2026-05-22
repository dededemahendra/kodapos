import { createFileRoute, Outlet } from '@tanstack/react-router';
import { PinGate } from '~/components/staff/pin-gate';

export const Route = createFileRoute('/_pos/shift')({
  component: ShiftLayout,
});

function ShiftLayout() {
  return (
    <PinGate>
      <Outlet />
    </PinGate>
  );
}
