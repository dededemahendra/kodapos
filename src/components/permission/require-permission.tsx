import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '~/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty';
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
            <EmptyDescription><Trans>Anda tidak punya akses ke halaman ini. Hubungi pemilik untuk meminta akses.</Trans></EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild variant="outline" size="sm"><Link to="/sale"><Trans>Kembali ke kasir</Trans></Link></Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }
  return <>{children}</>;
}
