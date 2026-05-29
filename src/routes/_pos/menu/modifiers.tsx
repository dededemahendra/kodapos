import { Trans } from '@lingui/react/macro';
import { useLingui } from '@lingui/react/macro';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';

export const Route = createFileRoute('/_pos/menu/modifiers')({
  component: ModifierGroupsPage,
});

function ModifierGroupsPage() {
  const { t } = useLingui();
  const groups = useQuery(api.menu.modifierGroups.list, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold"><Trans>Grup Modifier</Trans></h1>
          <p className="text-muted-foreground text-sm">
            <Trans>Dipakai ulang di banyak item — ubah di satu tempat.</Trans>
          </p>
        </div>
        <Link to="/menu/modifiers/$groupId" params={{ groupId: 'new' }} className="text-sm">
          <span className="px-3 py-1 rounded-md bg-primary text-primary-foreground"><Trans>+ Grup baru</Trans></span>
        </Link>
      </div>
      {groups === undefined && <p className="text-muted-foreground"><Trans>Memuat…</Trans></p>}
      {groups && groups.length === 0 && (
        <p className="text-muted-foreground"><Trans>Belum ada grup modifier. Buat satu untuk mulai.</Trans></p>
      )}
      {groups && groups.length > 0 && (
        <ul className="divide-y divide-border border border-border rounded-md">
          {groups.map((g) => (
            <li key={g._id} className="p-3 hover:bg-muted">
              <Link
                to="/menu/modifiers/$groupId"
                params={{ groupId: g._id }}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {g.required ? t`wajib` : t`opsional`} · {g.minSelect}/{g.maxSelect} ·{' '}
                    {g.options.length} <Trans>opsi</Trans>
                  </span>
                </div>
                <span className="text-muted-foreground">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
