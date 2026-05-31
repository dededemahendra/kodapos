import { MoreHorizontal } from 'lucide-react';
import { Fragment, type ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu';

export interface RowAction {
  label: ReactNode;
  onSelect: () => void;
  icon?: ReactNode;
  destructive?: boolean;
  separatorBefore?: boolean;
}

export function RowActions({
  items,
  label,
}: {
  items: RowAction[];
  /** Accessible label for the trigger, e.g. t`Aksi baris`. */
  label: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: action list is static per render
          <Fragment key={i}>
            {item.separatorBefore ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              variant={item.destructive ? 'destructive' : 'default'}
              onSelect={item.onSelect}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
