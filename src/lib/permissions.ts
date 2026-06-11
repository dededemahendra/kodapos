import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useActiveCashier } from './active-cashier';

export type Permission = 'canVoid' | 'canDiscount' | 'canManageShift' | 'canViewReports' | 'canEditMenu';

export function usePermissions(): {
  can: (p: Permission) => boolean;
  isOwner: boolean;
  isLoading: boolean;
} {
  const { cashierId } = useActiveCashier();
  const data = useQuery(api.staff.permissionsFor, cashierId ? { cashierId } : 'skip');
  return {
    can: (p) => (data ? data.role === 'owner' || data.permissions[p] : false),
    isOwner: data?.role === 'owner',
    isLoading: cashierId !== null && data === undefined,
  };
}
