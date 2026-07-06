import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { Store } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { RowActions } from '~/components/ui/row-actions';
import { Spinner } from '~/components/ui/spinner';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_admin/businesses')({
  component: AdminBusinessesPage,
});

type ConfirmState = {
  businessId: Id<'businesses'>;
  name: string;
  next: boolean;
} | null;

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function AdminBusinessesPage() {
  const [search, setSearch] = useState('');
  const businesses = useQuery(api.admin.listBusinesses, { search });
  const setSuspended = useMutation(api.admin.setBusinessSuspended);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      await setSuspended({ businessId: confirm.businessId, suspended: confirm.next });
      toast.success(confirm.next ? 'Business suspended' : 'Business reactivated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Businesses (platform)</h1>
        <Input
          placeholder="Search business, owner, or cafe"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {businesses === undefined ? (
        <div className="py-10">
          <Spinner />
        </div>
      ) : businesses.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Store />
            </EmptyMedia>
            <EmptyTitle>No businesses found</EmptyTitle>
            <EmptyDescription>Try a different search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3">Business</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Outlets</th>
                <th className="p-3">Members</th>
                <th className="p-3">Created</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {businesses.map((b) => (
                <tr key={b._id} className="border-b last:border-0">
                  <td className="p-3">{b.name}</td>
                  <td className="p-3">
                    <div>{b.ownerName ?? 'unnamed'}</div>
                    <div className="text-muted-foreground text-xs">
                      {b.ownerEmail ?? 'no email'}
                    </div>
                  </td>
                  <td className="p-3">
                    {b.cafes.length === 0 ? (
                      <span className="text-muted-foreground">none</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {b.cafes.map((c) => (
                          <Badge
                            key={c._id}
                            variant={c.setupCompleted ? 'outline' : 'secondary'}
                            title={c.city ?? undefined}
                          >
                            {c.name}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="p-3 tabular-nums">{b.memberCount}</td>
                  <td className="p-3 text-muted-foreground">{formatDate(b.createdAt)}</td>
                  <td className="p-3">
                    {b.suspended ? (
                      <Badge variant="destructive">suspended</Badge>
                    ) : (
                      <Badge variant="outline">active</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <RowActions
                      label="Row actions"
                      items={[
                        {
                          label: b.suspended ? 'Reactivate' : 'Suspend',
                          destructive: !b.suspended,
                          onSelect: () =>
                            setConfirm({
                              businessId: b._id,
                              name: b.name,
                              next: !b.suspended,
                            }),
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.next ? `Suspend ${confirm.name}?` : `Reactivate ${confirm?.name}?`}
        description={
          confirm?.next
            ? 'Every member of this business will be locked out of all outlets until reactivated.'
            : 'The business regains access to all its outlets immediately.'
        }
        confirmLabel="Confirm"
        destructive={confirm?.next === true}
        onConfirm={runConfirm}
      />
    </div>
  );
}
