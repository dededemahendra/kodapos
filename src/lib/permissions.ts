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
  // The signed-in account is always the cafe owner (only owners have accounts;
  // the server authorizes owner actions by the JWT, not the active cashier). So
  // the owner gate is account-based: the owner can always reach owner-only pages
  // (settings/staff), regardless of which cashier is PIN-active on the register.
  // The active cashier's role/permissions still drive the operational register
  // UI (canVoid/canEditMenu/...) so an operating cashier sees a restricted view.
  const cafe = useQuery(api.cafes.myCafe, {});
  const isAccountOwner = cafe != null;
  return {
    can: (p) => (data ? data.role === 'owner' || data.permissions[p] : isAccountOwner),
    isOwner: isAccountOwner || data?.role === 'owner',
    isLoading: cafe === undefined || (cashierId !== null && data === undefined),
  };
}
