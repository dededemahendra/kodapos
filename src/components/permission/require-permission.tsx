import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '~/components/ui/empty';
import { Spinner } from '~/components/ui/spinner';
import { type Permission, usePermissions } from '~/lib/permissions';

export function RequirePermission({
  perm, owner, children,
}: { perm?: Permission; owner?: boolean; children: ReactNode }) {
  const { can, isOwner, isLoading } = usePermissions();
  if (isLoading) {
    return <div className="flex justify-center py-12 text-muted-foreground"><Spinner /></div>;
  }
  const allowed = owner ? isOwner : perm ? can(perm) : true;
  if (!allowed) {
    return (
      <div className="p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><Lock /></EmptyMedia>
            <EmptyTitle><Trans>Akses ditolak</Trans></EmptyTitle>
          </EmptyHeader>
          <p className="text-sm text-muted-foreground mb-3"><Trans>Anda tidak punya akses ke halaman ini.</Trans></p>
          <Button asChild variant="outline" size="sm"><Link to="/sale"><Trans>Kembali ke kasir</Trans></Link></Button>
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}
