import { createFileRoute, Outlet } from '@tanstack/react-router';
import { ShiftGate } from '~/components/shift/shift-gate';
import { PinGate } from '~/components/staff/pin-gate';

export const Route = createFileRoute('/_pos/sale')({
  component: SaleLayout,
});

function SaleLayout() {
  return (
    <PinGate>
      <ShiftGate>
        <Outlet />
      </ShiftGate>
    </PinGate>
  );
}
