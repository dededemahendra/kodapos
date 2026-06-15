import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  type Row,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { Trans } from '@lingui/react/macro';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '~/components/ui/button';
import { Skeleton } from '~/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';
import { tableViewState } from './data-table-state';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  /** undefined === loading (Convex useQuery contract). */
  data: T[] | undefined;
  /** Rendered when data is an empty array. */
  emptyState: ReactNode;
  /** Per-row className, e.g. tint low-stock rows. */
  getRowClassName?: (row: T) => string;
  /** Initial sort, e.g. [{ id: 'name', desc: false }]. */
  initialSort?: SortingState;
  /** Skeleton row count while loading. */
  skeletonRows?: number;
  /** Rows per page (client-side pagination). Controls appear only when there
   * is more than one page. */
  pageSize?: number;
}

export function DataTable<T>({
  columns,
  data,
  emptyState,
  getRowClassName,
  initialSort = [],
  skeletonRows = 6,
  pageSize = 10,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort);
  const view = tableViewState(data);

  const table = useReactTable({
    data: data ?? [],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      canSort
                        ? sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : 'none'
                        : undefined
                    }
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                        {sorted === 'asc' ? (
                          <ChevronUp className="size-3.5" />
                        ) : sorted === 'desc' ? (
                          <ChevronDown className="size-3.5" />
                        ) : (
                          <ChevronsUpDown className="size-3.5 opacity-50" />
                        )}
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {view === 'loading' ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional and never reorder
              <TableRow key={`skeleton-${r}`}>
                {columns.map((_col, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells are positional and never reorder
                  <TableCell key={`skeleton-${r}-${c}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : view === 'empty' ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="p-0">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            table.getRowModel().rows.map((row: Row<T>) => (
              <TableRow
                key={row.id}
                className={cn(getRowClassName?.(row.original))}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {view === 'data' && pageCount > 1 ? (
        <div className="flex items-center justify-end gap-3 border-t px-3 py-2 text-sm">
          <span className="tabular-nums text-muted-foreground">
            {pageIndex + 1} / {pageCount}
          </span>
          <div className="flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft />
              <span className="sr-only">
                <Trans>Sebelumnya</Trans>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight />
              <span className="sr-only">
                <Trans>Berikutnya</Trans>
              </span>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
