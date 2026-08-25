import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';
import { Building2, Store, TriangleAlert, Users } from 'lucide-react';
import type * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { Skeleton } from '~/components/ui/skeleton';
import { formatCount } from '~/lib/formater';
import { privatePage } from '~/lib/seo';

export const Route = createFileRoute('/_admin/overview')({
  head: () => privatePage('Overview', 'kodapos admin'),
  component: AdminOverview,
});

function AdminOverview() {
  const stats = useQuery(api.admin.platformStats, {});

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Operator console</h1>
        <p className="text-muted-foreground text-sm">Platform activity across every tenant.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Users className="size-4" />}
          label="Users"
          value={stats && formatCount(stats.users.total)}
          hint={
            stats &&
            `${formatCount(stats.users.active)} active, ${formatCount(stats.users.admins)} admin`
          }
          delta={stats?.users.newLast7d}
        />
        <StatCard
          icon={<Building2 className="size-4" />}
          label="Businesses"
          value={stats && formatCount(stats.businesses.total)}
          delta={stats?.businesses.newLast7d}
        />
        <StatCard
          icon={<Store className="size-4" />}
          label="Cafes"
          value={stats && formatCount(stats.cafes.total)}
          delta={stats?.cafes.newLast7d}
        />
        <StatCard
          icon={<TriangleAlert className="size-4" />}
          label="Owners needing repair"
          value={stats && formatCount(stats.ownersNeedingRepair)}
          hint={stats && (stats.ownersNeedingRepair ? 'Fix outlet access in Users' : 'All healthy')}
        />
      </div>

      <Link to="/users" className="text-primary text-sm underline">
        Manage users
      </Link>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  delta,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | undefined;
  hint?: string | false | undefined;
  delta?: number | undefined;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="font-normal text-muted-foreground text-xs tracking-wide">
          {label}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        {value !== undefined ? (
          <p className="font-semibold text-2xl tabular-nums">{value}</p>
        ) : (
          <Skeleton className="h-8 w-16" />
        )}
        {hint ? <CardDescription className="mt-1 text-xs">{hint}</CardDescription> : null}
        {delta !== undefined && delta > 0 ? (
          <CardDescription className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
            +{formatCount(delta)} in last 7 days
          </CardDescription>
        ) : null}
      </CardContent>
    </Card>
  );
}
