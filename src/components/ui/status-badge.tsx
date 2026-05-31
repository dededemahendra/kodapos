import type { ReactNode } from 'react';
import { cn } from '~/lib/utils';
import {
  type StatusBadgeVariant,
  statusBadgeClasses,
} from './status-badge-variant';

export function StatusBadge({
  variant,
  children,
  className,
}: {
  variant: StatusBadgeVariant;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-xs font-medium',
        statusBadgeClasses(variant),
        className
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
