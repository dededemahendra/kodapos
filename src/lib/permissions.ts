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
  // The owner gate is account-based: the business owner can always reach
  // owner-only pages (settings/members), regardless of which cashier is
  // PIN-active on the register. Since Phase 4, managers also have accounts and a
  // non-null cafe, so ownership is the business-member ROLE (`myCafe.role`), not
  // merely "has a cafe". The active cashier's role/permissions still drive the
  // operational register UI (canVoid/canEditMenu/...) for an operating cashier.
  const cafe = useQuery(api.cafes.myCafe, {});
  const isAccountOwner = cafe?.role === 'owner';
  // A signed-in business member (owner OR manager) has owner-like back-office
  // capability for their active outlet. When a cashier is PIN-active, the
  // cashier's role/permissions still drive the operational register UI.
  const isAccountMember = cafe != null;
  return {
    can: (p) => (data ? data.role === 'owner' || data.permissions[p] : isAccountMember),
    isOwner: isAccountOwner || data?.role === 'owner',
    isLoading: cafe === undefined || (cashierId !== null && data === undefined),
  };
}
