import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';
import { useQuery } from 'convex/react';

export const Route = createFileRoute('/_pos/menu/modifiers')({
  component: ModifierGroupsPage,
});

function ModifierGroupsPage() {
  const groups = useQuery(api.menu.modifierGroups.list, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">Grup Modifier</h1>
          <p className="text-fg-muted text-sm">
            Dipakai ulang di banyak item — ubah di satu tempat.
          </p>
        </div>
        <Link to="/menu/modifiers/$groupId" params={{ groupId: 'new' }} className="text-sm">
          <span className="px-3 py-1 rounded-md bg-brand-600 text-white">+ Grup baru</span>
        </Link>
      </div>
      {groups === undefined && <p className="text-fg-muted">Memuat…</p>}
      {groups && groups.length === 0 && (
        <p className="text-fg-muted">Belum ada grup modifier. Buat satu untuk mulai.</p>
      )}
      {groups && groups.length > 0 && (
        <ul className="divide-y divide-border border border-border rounded-md">
          {groups.map((g) => (
            <li key={g._id} className="p-3 hover:bg-surface">
              <Link
                to="/menu/modifiers/$groupId"
                params={{ groupId: g._id }}
                className="flex items-center justify-between"
              >
                <div>
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs text-fg-muted ml-2">
                    {g.required ? 'wajib' : 'opsional'} · {g.minSelect}/{g.maxSelect} ·{' '}
                    {g.options.length} opsi
                  </span>
                </div>
                <span className="text-fg-muted">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
