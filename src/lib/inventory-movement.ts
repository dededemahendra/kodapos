import type { StatusBadgeVariant } from '~/components/ui/status-badge-variant';

export type MovementReason = 'sale' | 'adjustment' | 'waste' | 'purchase';

// Semantic colour for a movement row's type badge. Pure → unit-testable.
export function movementTypeVariant(reason: MovementReason): StatusBadgeVariant {
  switch (reason) {
    case 'sale':
      return 'muted';
    case 'adjustment':
      return 'success';
    case 'waste':
      return 'danger';
    case 'purchase':
      return 'success';
  }
}
