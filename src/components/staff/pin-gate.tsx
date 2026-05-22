import { Navigate } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useActiveCashier } from '~/lib/active-cashier';

export function PinGate({ children }: { children: ReactNode }) {
  const { cashierId } = useActiveCashier();
  if (cashierId === null) {
    return <Navigate to="/pin" replace />;
  }
  return <>{children}</>;
}
