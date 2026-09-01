import type * as React from 'react';
import { Card } from '~/components/ui/card';
import { cn } from '~/lib/utils';

export function DashboardCard({ className, ...props }: React.ComponentProps<typeof Card>) {
  return (
    <Card
      // Deliberately NOT overflow-hidden: the dashboard charts render
      // Recharts tooltips inside the card, and clipping would cut them off
      // near the edges. Cards that pin content to their own edge opt in.
      className={cn('flex flex-col rounded-xl', className)}
      {...props}
    />
  );
}
