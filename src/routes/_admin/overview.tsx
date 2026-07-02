import { Trans } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/_admin/overview')({
  component: AdminOverview,
});

function AdminOverview() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">
        <Trans>Konsol operator</Trans>
      </h1>
      <p className="text-muted-foreground">
        <Trans>Kelola pengguna platform dan akses lintas outlet.</Trans>
      </p>
      <Link to="/users" className="text-primary underline">
        <Trans>Kelola pengguna</Trans>
      </Link>
    </div>
  );
}
