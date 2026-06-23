import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { useEffect } from 'react';
import { useActiveCashier } from './active-cashier';

export type Permission = 'canVoid' | 'canDiscount' | 'canManageShift' | 'canViewReports' | 'canEditMenu';

export function usePermissions(): {
  can: (p: Permission) => boolean;
  isOwner: boolean;
  isLoading: boolean;
} {
  const { cashierId, clearCashier } = useActiveCashier();
  const data = useQuery(api.staff.permissionsFor, cashierId ? { cashierId } : 'skip');
  // A persisted active cashier that doesn't belong to the active outlet (e.g.
  // after switching/creating an outlet) resolves to null. Clear it so the
  // register re-PINs for the new outlet instead of operating with a stale,
  // permission-less cashier; the gates below fall back to account-member access
  // meanwhile. (`undefined` = still loading, so only clear on an explicit null.)
  useEffect(() => {
    if (cashierId && data === null) clearCashier();
  }, [cashierId, data, clearCashier]);

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
  // A resolved cashier is a non-null object; null (stale/cross-outlet) is
  // treated like "no cashier active" → account-member fallback.
  const hasCashier = data != null;
  return {
    can: (p) => (hasCashier ? data.role === 'owner' || data.permissions[p] : isAccountMember),
    isOwner: isAccountOwner || (hasCashier && data.role === 'owner'),
    isLoading: cafe === undefined || (cashierId !== null && data === undefined),
  };
}
