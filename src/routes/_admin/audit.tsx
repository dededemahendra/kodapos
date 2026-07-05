import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { ScrollText } from 'lucide-react';
import { Badge } from '~/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';

export const Route = createFileRoute('/_admin/audit')({
  component: AdminAuditPage,
});

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AdminAuditPage() {
  const entries = useQuery(api.admin.listAuditLog, {});

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-muted-foreground text-sm">
          Every platform-operator action, newest first.
        </p>
      </div>

      {entries === undefined ? (
        <div className="py-10">
          <Spinner />
        </div>
      ) : entries.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ScrollText />
            </EmptyMedia>
            <EmptyTitle>No activity yet</EmptyTitle>
            <EmptyDescription>Operator actions will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>
                <th className="p-3">When</th>
                <th className="p-3">Operator</th>
                <th className="p-3">Action</th>
                <th className="p-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e._id} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td className="p-3">{e.actorName ?? 'unknown'}</td>
                  <td className="p-3">
                    <Badge variant="outline" className="font-mono text-xs">
                      {e.action}
                    </Badge>
                  </td>
                  <td className="p-3">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
