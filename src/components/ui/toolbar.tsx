import type { ReactNode } from 'react';
import { Input } from '~/components/ui/input';
import { cn } from '~/lib/utils';

export interface ToolbarFilter {
  label: ReactNode;
  value: string;
  count?: number;
}

export function Toolbar({
  search,
  onSearch,
  searchPlaceholder,
  filters,
  active,
  onFilter,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  filters: ToolbarFilter[];
  active: string;
  onFilter: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-3 flex-wrap">
      <Input
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        className="max-w-xs"
      />
      <div className="flex items-center gap-1">
        {filters.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => onFilter(f.value)}
            className={cn(
              'text-sm px-3 py-1.5 rounded-md',
              active === f.value
                ? 'bg-accent text-primary font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {f.label}
            {f.count !== undefined ? (
              <span className="ml-1 tabular-nums opacity-70">{f.count}</span>
            ) : null}
          </button>
        ))}
      </div>
      {children ? <div className="ml-auto">{children}</div> : null}
    </div>
  );
}
