import { Trans } from '@lingui/react/macro';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import type { Id } from 'convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { ModifierGroupForm } from '~/components/menu/modifier-group-form';
import { FormSkeleton } from '~/components/ui/loading-skeletons';
import { Skeleton } from '~/components/ui/skeleton';

export const Route = createFileRoute('/_pos/menu/modifiers/$groupId')({
  component: ModifierGroupEditor,
});

function ModifierGroupEditor() {
  const { groupId } = Route.useParams();
  const navigate = useNavigate();
  const isNew = groupId === 'new';
  const existing = useQuery(
    api.menu.modifierGroups.getById,
    isNew ? 'skip' : { id: groupId as Id<'modifierGroups'> }
  );

  if (!isNew && existing === undefined)
    return (
      <div>
        <Skeleton className="mb-4 h-7 w-48" />
        <FormSkeleton rows={5} />
      </div>
    );
  if (!isNew && existing === null) return <p className="text-muted-foreground"><Trans>Grup tidak ditemukan.</Trans></p>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">
        {isNew ? <Trans>Grup modifier baru</Trans> : <Trans>Edit grup modifier</Trans>}
      </h1>
      <ModifierGroupForm
        {...(existing?._id !== undefined && { initialId: existing._id })}
        initialName={existing?.name ?? ''}
        initialRequired={existing?.required ?? false}
        initialMinSelect={existing?.minSelect ?? 1}
        initialMaxSelect={existing?.maxSelect ?? 1}
        initialOptions={
          existing?.options.map((o) => ({
            id: o._id,
            name: o.name,
            priceAdjustmentIDR: o.priceAdjustmentIDR,
            position: o.position,
          })) ?? []
        }
        onSaved={() => navigate({ to: '/menu/modifiers' })}
      />
    </div>
  );
}
