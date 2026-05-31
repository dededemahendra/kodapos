import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui/table';
import { cn } from '~/lib/utils';
import { Skeleton } from '~/components/ui/skeleton';
import { tableViewState } from './data-table-state';
import { moveId } from './reorder';

export interface ReorderableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
}

export interface ReorderableTableProps<T> {
  columns: ReorderableColumn<T>[];
  /** undefined === loading (Convex useQuery contract). */
  data: T[] | undefined;
  getRowId: (row: T) => string;
  emptyState: ReactNode;
  onReorder: (orderedIds: string[]) => void | Promise<void>;
  /** Accessible label for the drag handle, e.g. t`Seret untuk menata ulang`. */
  reorderLabel: string;
  getRowClassName?: (row: T) => string;
  skeletonRows?: number;
}

export function ReorderableTable<T>({
  columns,
  data,
  getRowId,
  emptyState,
  onReorder,
  reorderLabel,
  getRowClassName,
  skeletonRows = 6,
}: ReorderableTableProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const view = tableViewState(data);
  const rows = data ?? [];
  const ids = rows.map(getRowId);
  const colCount = columns.length + 1; // + drag handle

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const next = moveId(ids, String(active.id), String(over.id));
    if (next !== ids) void onReorder(next);
  }

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            {columns.map((c) => (
              <TableHead key={c.id}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {view === 'loading' ? (
            Array.from({ length: skeletonRows }).map((_, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton rows are positional and never reorder
              <TableRow key={`skeleton-${r}`}>
                {Array.from({ length: colCount }).map((_c, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton cells are positional and never reorder
                  <TableCell key={`skeleton-${r}-${c}`}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : view === 'empty' ? (
            <TableRow>
              <TableCell colSpan={colCount} className="p-0">
                {emptyState}
              </TableCell>
            </TableRow>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                {rows.map((row) => (
                  <SortableRow
                    key={getRowId(row)}
                    id={getRowId(row)}
                    reorderLabel={reorderLabel}
                    className={cn(getRowClassName?.(row))}
                  >
                    {columns.map((c) => (
                      <TableCell key={c.id}>{c.cell(row)}</TableCell>
                    ))}
                  </SortableRow>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function SortableRow({
  id,
  reorderLabel,
  className,
  children,
}: {
  id: string;
  reorderLabel: string;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <TableRow
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(isDragging && 'opacity-60', className)}
    >
      <TableCell className="w-8">
        <button
          type="button"
          className="cursor-grab text-muted-foreground hover:text-foreground"
          aria-label={reorderLabel}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </TableCell>
      {children}
    </TableRow>
  );
}
