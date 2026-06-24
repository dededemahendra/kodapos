import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '~/components/ui/badge';
import { ConfirmDialog } from '~/components/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Input } from '~/components/ui/input';
import { RowActions } from '~/components/ui/row-actions';
import { Spinner } from '~/components/ui/spinner';
import { usePermissions } from '~/lib/permissions';
import { toast } from '~/lib/toast';

export const Route = createFileRoute('/_pos/admin/users')({
  component: AdminUsersPage,
});

type ConfirmState =
  | { kind: 'deactivate'; userId: Id<'users'>; name: string; next: boolean }
  | { kind: 'admin'; userId: Id<'users'>; name: string; next: boolean }
  | null;

function AdminUsersPage() {
  const { isPlatformAdmin, isLoading } = usePermissions();
  const [search, setSearch] = useState('');
  const users = useQuery(api.admin.listUsers, isPlatformAdmin ? { search } : 'skip');
  const fixAccess = useMutation(api.admin.fixOutletAccess);
  const setDeactivated = useMutation(api.admin.setDeactivated);
  const setAdmin = useMutation(api.admin.setPlatformAdmin);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  if (isLoading) return <div className="p-6"><Spinner /></div>;
  if (!isPlatformAdmin) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
            <EmptyTitle>Admins only</EmptyTitle>
            <EmptyDescription>You do not have platform admin access.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const onFix = async (userId: Id<'users'>) => {
    try {
      const { fixed } = await fixAccess({ userId });
      toast.success(fixed ? 'Outlet access repaired' : 'Nothing to fix');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to fix access');
    }
  };

  const runConfirm = async () => {
    if (!confirm) return;
    try {
      if (confirm.kind === 'deactivate') {
        await setDeactivated({ userId: confirm.userId, deactivated: confirm.next });
        toast.success(confirm.next ? 'User deactivated' : 'User reactivated');
      } else {
        await setAdmin({ userId: confirm.userId, isAdmin: confirm.next });
        toast.success(confirm.next ? 'Admin granted' : 'Admin removed');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Users (platform)</h1>
        <Input
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {users === undefined ? (
        <div className="py-10"><Spinner /></div>
      ) : users.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><ShieldCheck /></EmptyMedia>
            <EmptyTitle>No users found</EmptyTitle>
            <EmptyDescription>Try a different search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Email</th>
                <th className="p-3">Cafes</th>
                <th className="p-3">Role</th>
                <th className="p-3">Status</th>
                <th className="p-3 w-10" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id} className="border-b last:border-0">
                  <td className="p-3">
                    {u.name ?? 'unnamed'}
                    {u.isPlatformAdmin && <Badge variant="secondary" className="ml-2">admin</Badge>}
                  </td>
                  <td className="p-3 text-muted-foreground">{u.email ?? 'no email'}</td>
                  <td className="p-3">{u.cafeNames.join(', ') || 'none'}</td>
                  <td className="p-3">{u.role ?? 'none'}</td>
                  <td className="p-3">
                    {u.deactivated ? (
                      <Badge variant="destructive">deactivated</Badge>
                    ) : (
                      <Badge variant="outline">active</Badge>
                    )}
                    {u.accessHealth === 'no_outlet' && (
                      <Badge variant="secondary" className="ml-2">no outlet</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <RowActions
                      label="Row actions"
                      items={[
                        ...(u.accessHealth === 'no_outlet'
                          ? [{ label: 'Fix access', onSelect: () => onFix(u._id) }]
                          : []),
                        {
                          label: u.deactivated ? 'Reactivate' : 'Deactivate',
                          destructive: !u.deactivated,
                          onSelect: () =>
                            setConfirm({
                              kind: 'deactivate',
                              userId: u._id,
                              name: u.name ?? 'this user',
                              next: !u.deactivated,
                            }),
                        },
                        {
                          label: u.isPlatformAdmin ? 'Remove admin' : 'Make admin',
                          destructive: u.isPlatformAdmin,
                          onSelect: () =>
                            setConfirm({
                              kind: 'admin',
                              userId: u._id,
                              name: u.name ?? 'this user',
                              next: !u.isPlatformAdmin,
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
        title={
          confirm?.kind === 'deactivate'
            ? confirm.next
              ? `Deactivate ${confirm.name}?`
              : `Reactivate ${confirm.name}?`
            : confirm?.next
              ? `Make ${confirm?.name} an admin?`
              : `Remove admin from ${confirm?.name}?`
        }
        description={
          confirm?.kind === 'deactivate' && confirm.next
            ? 'They will be locked out of all outlets until reactivated.'
            : confirm?.kind === 'admin' && confirm.next
              ? 'They will gain full platform admin access.'
              : 'This change takes effect immediately.'
        }
        confirmLabel="Confirm"
        destructive={
          confirm?.kind === 'deactivate'
            ? confirm.next
            : confirm?.kind === 'admin'
              ? !confirm.next
              : false
        }
        onConfirm={runConfirm}
      />
    </div>
  );
}
